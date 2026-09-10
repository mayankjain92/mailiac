import { Router, type IRouter, type Request, type Response, type NextFunction } from 'express';
import { randomUUID } from 'node:crypto';
import {
  connectDb,
  GmailAccountModel,
  EmailAnalysisRecordModel,
  OAuthTransactionModel,
  type GmailAccountDocument,
} from '@mailiac/db';
import type { GmailMessageAnalysisEnrichment } from '@mailiac/shared-types';
import {
  generateAuthUrl,
  exchangeCodeForTokens,
  revokeToken,
  getOAuthClient,
} from '../services/googleAuth.js';
import { listMessages, fetchRawMessage } from '../services/gmailClient.js';
import { emailQueue } from '../queue.js';
import { requireAuth } from '../middleware/auth.js';

export const gmailRouter: IRouter = Router();

/**
 * Helper to resolve sessionId from request headers, query parameters, or cookies.
 */
export function resolveSessionId(req: Request): string | undefined {
  const rawHeader = req.headers['x-session-id'];
  const headerSessionId = Array.isArray(rawHeader) ? rawHeader[0] : rawHeader;
  if (typeof headerSessionId === 'string' && headerSessionId.trim() !== '') {
    return headerSessionId.trim();
  }

  const querySessionId = req.query['sessionId'];
  if (typeof querySessionId === 'string' && querySessionId.trim() !== '') {
    return querySessionId.trim();
  }

  const cookieHeader = req.headers.cookie;
  if (cookieHeader) {
    const match = cookieHeader.match(/(?:^|;\s*)mailiac_session_id=([^;]+)/);
    if (match && match[1]) {
      return decodeURIComponent(match[1]);
    }
  }

  return undefined;
}

/**
 * Looks up the connected Gmail account strictly for the authenticated user or browser session.
 * Prioritizes userId if authenticated, never falling back to another user's account.
 */
export async function findConnectedAccount(
  userId?: string,
  sessionId?: string
): Promise<GmailAccountDocument | null> {
  if (userId && typeof userId === 'string' && userId.trim() !== '') {
    const byUser = await GmailAccountModel.findOne({ userId: userId.trim() });
    if (byUser) return byUser;
  }
  if (sessionId && typeof sessionId === 'string' && sessionId.trim() !== '') {
    return await GmailAccountModel.findOne({ sessionId: sessionId.trim() });
  }
  return null;
}

/**
 * GET /api/gmail/auth/url or /api/gmail/url
 * Generates the Google OAuth 2.0 consent URL bound to the authenticated user's state or browser session.
 */
gmailRouter.get(['/auth/url', '/url'], requireAuth, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const mongoUri = process.env['MONGODB_URI'] ?? 'mongodb://localhost:27017/mailiac';
    await connectDb(mongoUri);

    const existingSessionId = resolveSessionId(req) ?? randomUUID();
    const state = existingSessionId;

    if (OAuthTransactionModel && typeof OAuthTransactionModel.create === 'function') {
      await OAuthTransactionModel.create({
        id: state,
        userId: req.user!.id,
        sessionId: existingSessionId,
        action: 'gmail',
        expiresAt: new Date(Date.now() + 10 * 60 * 1000), // 10 minutes TTL
        used: false,
      });
    }

    const url = generateAuthUrl(state);
    res.json({ url, sessionId: existingSessionId });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/gmail/auth/callback & /api/gmail/callback
 * Handles Google OAuth redirect, validates transaction state, exchanges code for tokens,
 * persists the account in MongoDB scoped to userId/session, and redirects to frontend.
 */
gmailRouter.get(['/auth/callback', '/callback'], async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const code = req.query['code'];
    const state = req.query['state'];
    const frontendUrl = process.env['FRONTEND_URL'] ?? 'http://localhost:3000';

    if (!code || typeof code !== 'string' || code.trim() === '') {
      res.status(400).json({ error: 'Authorization code is required.' });
      return;
    }

    const mongoUri = process.env['MONGODB_URI'] ?? 'mongodb://localhost:27017/mailiac';
    await connectDb(mongoUri);

    let targetUserId = req.user?.id;
    let targetSessionId = resolveSessionId(req) ?? (typeof state === 'string' ? state.trim() : randomUUID());

    if (typeof state === 'string' && state.trim() !== '') {
      if (OAuthTransactionModel && typeof OAuthTransactionModel.findOne === 'function') {
        const tx = await OAuthTransactionModel.findOne({ id: state.trim() });
        if (tx) {
          if (tx.used) {
            res.status(400).json({ error: 'OAuth transaction has already been used.' });
            return;
          }
          if (tx.expiresAt < new Date()) {
            res.status(400).json({ error: 'OAuth transaction has expired.' });
            return;
          }

          // Prevent account confusion: if logged-in user differs from initiating user
          if (req.user?.id && req.user.id !== tx.userId) {
            res.status(403).json({ error: 'OAuth transaction does not match authenticated user.' });
            return;
          }

          tx.used = true;
          await tx.save();

          targetUserId = tx.userId;
          if (tx.sessionId) {
            targetSessionId = tx.sessionId;
          }
        }
      }
    }

    const tokens = await exchangeCodeForTokens(code);

    const filter = targetUserId ? { userId: targetUserId } : { sessionId: targetSessionId };

    await GmailAccountModel.findOneAndUpdate(
      filter,
      {
        userId: targetUserId,
        sessionId: targetSessionId,
        email: tokens.email,
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        tokenExpiry: tokens.tokenExpiry,
        googleAccountId: tokens.googleAccountId,
        scopes: tokens.scopes,
      },
      { upsert: true, new: true }
    );

    res.cookie('mailiac_session_id', targetSessionId, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
    });

    res.redirect(`${frontendUrl}/mailbox?gmail=connected&sessionId=${encodeURIComponent(targetSessionId)}`);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/gmail/status
 * Returns connection status and email address of connected Gmail account.
 */
gmailRouter.get('/status', requireAuth, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const mongoUri = process.env['MONGODB_URI'] ?? 'mongodb://localhost:27017/mailiac';
    await connectDb(mongoUri);

    const sessionId = resolveSessionId(req);
    const account = await findConnectedAccount(req.user!.id, sessionId);

    if (!account) {
      res.json({ connected: false });
      return;
    }

    res.json({
      connected: true,
      email: account.email,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/gmail/disconnect
 * Revokes Google OAuth token and deletes connected account from MongoDB.
 */
gmailRouter.delete('/disconnect', requireAuth, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const mongoUri = process.env['MONGODB_URI'] ?? 'mongodb://localhost:27017/mailiac';
    await connectDb(mongoUri);

    const sessionId = resolveSessionId(req);
    const account = await findConnectedAccount(req.user!.id, sessionId);

    if (!account) {
      res.status(404).json({ error: 'No connected Gmail account found.' });
      return;
    }

    try {
      await revokeToken(account.accessToken);
    } catch {
      // Ignore remote revocation error so database record cleanup always succeeds
    }

    await GmailAccountModel.deleteOne({ _id: account._id });

    res.clearCookie('mailiac_session_id', { path: '/' });
    res.json({ success: true, message: 'Gmail account disconnected.' });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/gmail/messages
 * Returns a paginated list of recent email metadata for the connected Gmail account.
 */
gmailRouter.get('/messages', requireAuth, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const mongoUri = process.env['MONGODB_URI'] ?? 'mongodb://localhost:27017/mailiac';
    await connectDb(mongoUri);

    const sessionId = resolveSessionId(req);
    const account = await findConnectedAccount(req.user!.id, sessionId);

    if (!account) {
      res.status(401).json({
        error: 'No connected Gmail account found. Please connect your Gmail account.',
      });
      return;
    }

    const auth = getOAuthClient();
    auth.setCredentials({
      access_token: account.accessToken,
      ...(account.refreshToken ? { refresh_token: account.refreshToken } : {}),
    });

    const q = typeof req.query['q'] === 'string' ? req.query['q'] : undefined;
    const pageToken =
      typeof req.query['pageToken'] === 'string' ? req.query['pageToken'] : undefined;
    const maxResults = req.query['maxResults']
      ? Math.min(Number(req.query['maxResults']), 50)
      : undefined;

    const result = await listMessages(auth, { q, pageToken, maxResults });

    const gmailIds = result.messages.map((m) => m.id);
    const query: Record<string, unknown> = {
      gmailMessageId: { $in: gmailIds },
      userId: req.user!.id,
    };
    const existingRecords = await EmailAnalysisRecordModel.find(query).lean();

    const enrichedMessages = result.messages.map((msg) => {
      const match = existingRecords.find((r) => r.gmailMessageId === msg.id);
      const enrichment: GmailMessageAnalysisEnrichment = {
        analyzed: Boolean(match),
        jobId: match?.jobId,
        finalScore: match?.finalScore,
        verdict: match?.verdict,
      };
      return {
        ...msg,
        ...enrichment,
      };
    });

    res.json({
      messages: enrichedMessages,
      nextPageToken: result.nextPageToken,
    });
  } catch (err: unknown) {
    const errorObj = err as { message?: string; status?: number } | undefined;
    const errMsg = errorObj?.message || String(err);
    if (errMsg.includes('insufficient authentication scopes') || errorObj?.status === 403) {
      res.status(403).json({
        error: 'Insufficient Gmail permissions granted. Please click Disconnect and reconnect your Gmail account, making sure to accept the read-only email permission on Google consent screen.',
      });
      return;
    }
    next(err);
  }
});

/**
 * POST /api/gmail/messages/:messageId/analyze
 * Fetches raw RFC 822 MIME payload from Gmail, decodes base64url to Buffer,
 * and enqueues forensic analysis job to BullMQ 'email-forensics' queue.
 */
gmailRouter.post(
  '/messages/:messageId/analyze',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const messageId = req.params['messageId'];
      if (!messageId || typeof messageId !== 'string' || messageId.trim() === '') {
        res.status(400).json({ error: 'Message ID is required.' });
        return;
      }

      const mongoUri = process.env['MONGODB_URI'] ?? 'mongodb://localhost:27017/mailiac';
      await connectDb(mongoUri);

      const sessionId = resolveSessionId(req);
      const account = await findConnectedAccount(req.user!.id, sessionId);

      if (!account) {
        res.status(401).json({
          error: 'No connected Gmail account found. Please connect your Gmail account.',
        });
        return;
      }

      const auth = getOAuthClient();
      auth.setCredentials({
        access_token: account.accessToken,
        ...(account.refreshToken ? { refresh_token: account.refreshToken } : {}),
      });

      const rawEmlBuffer = await fetchRawMessage(auth, messageId.trim());

      const analysisJobId = randomUUID();

      await emailQueue.add(
        'process-email',
        {
          messageId: analysisJobId,
          buffer: rawEmlBuffer,
          source: 'gmail',
          gmailMessageId: messageId.trim(),
          userId: req.user!.id,
        },
        { jobId: analysisJobId }
      );

      res.status(202).json({
        jobId: analysisJobId,
        status: 'queued',
      });
    } catch (err) {
      next(err);
    }
  }
);

