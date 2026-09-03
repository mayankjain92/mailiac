import { Router, type IRouter, type Request, type Response, type NextFunction } from 'express';
import { randomUUID } from 'node:crypto';
import {
  connectDb,
  GmailAccountModel,
  EmailAnalysisRecordModel,
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

export const gmailRouter: IRouter = Router();

/**
 * Helper to resolve sessionId from request headers, query parameters, or cookies.
 */
export function resolveSessionId(req: Request): string | undefined {
  const headerSessionId = req.headers['x-session-id'];
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
 * Safely looks up the connected Gmail account for a given session or latest active account.
 */
export async function findConnectedAccount(
  sessionId?: string
): Promise<GmailAccountDocument | null> {
  if (sessionId) {
    return await GmailAccountModel.findOne({ sessionId });
  }
  const query = GmailAccountModel.findOne();
  if (query && typeof query.sort === 'function') {
    return await query.sort({ updatedAt: -1 });
  }
  return await query;
}

/**
 * GET /api/gmail/auth/url or /api/gmail/url
 * Generates the Google OAuth 2.0 consent URL.
 */
gmailRouter.get(['/auth/url', '/url'], (req: Request, res: Response, next: NextFunction): void => {
  try {
    const existingSessionId = resolveSessionId(req) ?? randomUUID();
    const url = generateAuthUrl(existingSessionId);
    res.json({ url });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/gmail/auth/callback & /api/gmail/callback
 * Handles Google OAuth redirect, exchanges authorization code for tokens,
 * persists the account in MongoDB, sets a session cookie, and redirects to frontend.
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

    const tokens = await exchangeCodeForTokens(code);

    const sessionId =
      typeof state === 'string' && state.trim() !== ''
        ? state.trim()
        : resolveSessionId(req) ?? randomUUID();

    const mongoUri = process.env['MONGODB_URI'] ?? 'mongodb://localhost:27017/mailiac';
    await connectDb(mongoUri);

    await GmailAccountModel.findOneAndUpdate(
      { sessionId },
      {
        sessionId,
        email: tokens.email,
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        tokenExpiry: tokens.tokenExpiry,
      },
      { upsert: true, new: true }
    );

    res.cookie('mailiac_session_id', sessionId, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
    });

    res.redirect(`${frontendUrl}/?gmail=connected`);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/gmail/status
 * Returns connection status and email address of connected Gmail account.
 */
gmailRouter.get('/status', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const mongoUri = process.env['MONGODB_URI'] ?? 'mongodb://localhost:27017/mailiac';
    await connectDb(mongoUri);

    const sessionId = resolveSessionId(req);
    const account = await findConnectedAccount(sessionId);

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
gmailRouter.delete('/disconnect', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const mongoUri = process.env['MONGODB_URI'] ?? 'mongodb://localhost:27017/mailiac';
    await connectDb(mongoUri);

    const sessionId = resolveSessionId(req);
    const account = await findConnectedAccount(sessionId);

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
gmailRouter.get('/messages', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const mongoUri = process.env['MONGODB_URI'] ?? 'mongodb://localhost:27017/mailiac';
    await connectDb(mongoUri);

    const sessionId = resolveSessionId(req);
    const account = await findConnectedAccount(sessionId);

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
    const existingRecords = await EmailAnalysisRecordModel.find({
      gmailMessageId: { $in: gmailIds },
    }).lean();

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
      const account = await findConnectedAccount(sessionId);

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

