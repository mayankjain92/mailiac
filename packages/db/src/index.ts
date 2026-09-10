import mongoose, { Schema, model, type Document } from 'mongoose';
import type { AnalysisReport } from '@mailiac/shared-types';

// ---------------------------------------------------------------------------
// Connection helper
// ---------------------------------------------------------------------------

export async function connectDb(uri: string): Promise<void> {
  if (mongoose.connection.readyState === 1) {
    return;
  }
  await mongoose.connect(uri);
  await fixLegacyEmailAnalysisIndexes();
}

export async function disconnectDb(): Promise<void> {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
}

// ---------------------------------------------------------------------------
// AnalysisReport Mongoose schema + model
// ---------------------------------------------------------------------------

export type AnalysisReportDocument = AnalysisReport &
  Document & {
    userId?: string;
    expireAt?: Date;
  };

const findingSchema = new Schema(
  {
    type: { type: String, required: true },
    severity: { type: String, enum: ['INFO', 'LOW', 'MEDIUM', 'HIGH'], required: true },
    description: { type: String, required: true },
  },
  { _id: false }
);

const forensicHopSchema = new Schema(
  {
    ip: { type: String, required: true },
    hostnameClaimed: { type: String },
    ptrValid: { type: Boolean, required: true },
    isPrivate: { type: Boolean, required: true },
    city: { type: String },
    country: { type: String },
    coordinates: { type: [Number] },
    asn: { type: String },
    trusted: { type: Boolean, required: true },
  },
  { _id: false }
);

const authResultSchema = new Schema(
  {
    spf: { type: String, enum: ['pass', 'fail', 'neutral', 'none'], required: true },
    dkim: { type: String, enum: ['pass', 'fail', 'none'], required: true },
    dmarcAlignment: { type: String, enum: ['strict', 'relaxed', 'fail'], required: true },
    arcPass: { type: Boolean, required: true },
    authScore: { type: Number, required: true },
    findings: { type: [findingSchema] },
  },
  { _id: false }
);

const riskMatrixSchema = new Schema(
  {
    authScore: { type: Number, required: true },
    identityScore: { type: Number, required: true },
    ipScore: { type: Number, required: true },
    nlpScore: { type: Number, required: true },
    finalScore: { type: Number, required: true },
    pillars: {
      type: new Schema({
        authentication: {
          score: { type: Number, required: true },
          weight: { type: Number, required: true },
          findings: { type: [findingSchema], required: true },
        },
        identity: {
          score: { type: Number, required: true },
          weight: { type: Number, required: true },
          findings: { type: [findingSchema], required: true },
        },
        infrastructure: {
          score: { type: Number, required: true },
          weight: { type: Number, required: true },
          findings: { type: [findingSchema], required: true },
        },
        nlp: {
          score: { type: Number, required: true },
          weight: { type: Number, required: true },
          findings: { type: [findingSchema], required: true },
        },
      }, { _id: false }),
      required: false, // Optional for backwards compatibility with old records if needed, but worker always provides it now
    }
  },
  { _id: false }
);

const analysisReportSchema = new Schema<AnalysisReportDocument>(
  {
    messageId: { type: String, required: true },
    userId: { type: String, index: true },
    senderDomain: { type: String, required: true, index: true },
    timestamp: { type: String, required: true },
    executionTimeMs: { type: Number },
    forensicPath: { type: [forensicHopSchema], required: true },
    authResults: { type: authResultSchema, required: true },
    riskMatrix: { type: riskMatrixSchema, required: true },
    aiSummary: {
      urgency: { type: Number, required: true },
      intent: { type: [String], required: true },
      integrityHash: { type: String, required: true },
      confidence: { type: Number },
      findings: { type: [findingSchema] },
    },
    // TTL field: document is automatically removed 24 h after expireAt
    expireAt: {
      type: Date,
      index: { expires: '24h' },
    },
  },
  { timestamps: false }
);

analysisReportSchema.index({ messageId: 1 }, { unique: true });
analysisReportSchema.index({ userId: 1, timestamp: -1 });

export const AnalysisReportModel =
  (mongoose.models?.['AnalysisReport'] as mongoose.Model<AnalysisReportDocument>) ||
  model<AnalysisReportDocument>('AnalysisReport', analysisReportSchema);

// ---------------------------------------------------------------------------
// RawEmail Mongoose schema + model (Preserves original EML payloads)
// ---------------------------------------------------------------------------

export interface RawEmailRecord {
  messageId: string;
  userId?: string;
  buffer: Uint8Array | unknown;
  source?: 'eml' | 'gmail' | 'sandbox';
  gmailMessageId?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export type RawEmailDocument = RawEmailRecord & Document;

const rawEmailSchema = new Schema<RawEmailDocument>(
  {
    messageId: { type: String, required: true },
    userId: { type: String, index: true },
    buffer: { type: Schema.Types.Buffer, required: true },
    source: { type: String, enum: ['eml', 'gmail', 'sandbox'], default: 'eml' },
    gmailMessageId: { type: String },
  },
  { timestamps: true }
);

rawEmailSchema.index({ messageId: 1 }, { unique: true });
rawEmailSchema.index({ userId: 1, messageId: 1 });

export const RawEmailModel =
  (mongoose.models?.['RawEmail'] as mongoose.Model<RawEmailDocument>) ||
  model<RawEmailDocument>('RawEmail', rawEmailSchema);

// ---------------------------------------------------------------------------
// GmailAccount Mongoose schema + model
// ---------------------------------------------------------------------------

export interface GmailAccount {
  userId?: string;
  sessionId: string;
  googleAccountId?: string;
  email: string;
  accessToken: string;
  refreshToken?: string;
  tokenExpiry: Date;
  scopes?: string[];
  createdAt?: Date;
  updatedAt?: Date;
}

export type GmailAccountDocument = GmailAccount & Document;

const gmailAccountSchema = new Schema<GmailAccountDocument>(
  {
    userId: { type: String, index: true },
    sessionId: { type: String, required: true, index: true },
    googleAccountId: { type: String },
    email: { type: String, required: true },
    accessToken: { type: String, required: true },
    refreshToken: { type: String },
    tokenExpiry: { type: Date, required: true },
    scopes: [{ type: String }],
  },
  { timestamps: true }
);

export const GmailAccountModel =
  (mongoose.models?.['GmailAccount'] as mongoose.Model<GmailAccountDocument>) ||
  model<GmailAccountDocument>('GmailAccount', gmailAccountSchema);

export type GmailConnection = GmailAccount;
export type GmailConnectionDocument = GmailAccountDocument;
export const GmailConnectionModel = GmailAccountModel;

// ---------------------------------------------------------------------------
// EmailAnalysisRecord Mongoose schema + model (for Unified .EML + Gmail Tracking)
// ---------------------------------------------------------------------------

export interface EmailAnalysisRecord {
  jobId: string;
  userId?: string;
  source: 'eml' | 'gmail' | 'sandbox';
  gmailMessageId?: string;
  sender?: string;
  subject?: string;
  senderDomain: string;
  finalScore: number;
  verdict: 'QUARANTINE' | 'FLAG' | 'SAFE';
  authScore: number;
  identityScore: number;
  ipScore: number;
  nlpScore: number;
  timestamp: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export type EmailAnalysisRecordDocument = EmailAnalysisRecord & Document;

const emailAnalysisRecordSchema = new Schema<EmailAnalysisRecordDocument>(
  {
    jobId: { type: String, required: true },
    userId: { type: String, index: true },
    source: { type: String, enum: ['eml', 'gmail', 'sandbox'], required: true },
    gmailMessageId: { type: String },
    sender: { type: String },
    subject: { type: String },
    senderDomain: { type: String, required: true },
    finalScore: { type: Number, required: true },
    verdict: { type: String, enum: ['QUARANTINE', 'FLAG', 'SAFE'], required: true },
    authScore: { type: Number, required: true },
    identityScore: { type: Number, required: true },
    ipScore: { type: Number, required: true },
    nlpScore: { type: Number, required: true },
    timestamp: { type: String, required: true },
  },
  {
    timestamps: true,
    autoIndex: false, // Prevents race condition with live duplicates before cleanup migration runs
  }
);

emailAnalysisRecordSchema.index({ jobId: 1 }, { unique: true });
emailAnalysisRecordSchema.index(
  { userId: 1, gmailMessageId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      gmailMessageId: { $type: 'string' },
    },
  }
);
emailAnalysisRecordSchema.index({ userId: 1, createdAt: -1 });
emailAnalysisRecordSchema.index({ userId: 1, source: 1, createdAt: -1 });
emailAnalysisRecordSchema.index({ userId: 1, verdict: 1, createdAt: -1 });

export const EmailAnalysisRecordModel =
  (mongoose.models?.['EmailAnalysisRecord'] as mongoose.Model<EmailAnalysisRecordDocument>) ||
  model<EmailAnalysisRecordDocument>('EmailAnalysisRecord', emailAnalysisRecordSchema);

/**
 * Migration cleanup routine to collapse any duplicate gmailMessageId records
 * down to the most recent one (by createdAt / updatedAt).
 */
export async function cleanupDuplicateGmailRecords(): Promise<{ duplicatesRemoved: number }> {
  try {
    const duplicates = await EmailAnalysisRecordModel.aggregate([
      { $match: { gmailMessageId: { $exists: true, $ne: null }, userId: { $exists: true, $ne: null } } },
      {
        $group: {
          _id: { userId: '$userId', gmailMessageId: '$gmailMessageId' },
          count: { $sum: 1 },
          docs: { $push: { id: '$_id', createdAt: '$createdAt' } },
        },
      },
      { $match: { count: { $gt: 1 } } },
    ]);

    let duplicatesRemoved = 0;

    for (const group of duplicates) {
      const sorted = group.docs.sort(
        (a: { createdAt?: Date; id: unknown }, b: { createdAt?: Date; id: unknown }) => {
          const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
          const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
          return timeB - timeA;
        }
      );

      // Keep the newest (index 0), delete older duplicates
      const idsToDelete = sorted.slice(1).map((d: { id: unknown }) => d.id);
      const deleteResult = await EmailAnalysisRecordModel.deleteMany({ _id: { $in: idsToDelete } });
      duplicatesRemoved += deleteResult.deletedCount || 0;
    }

    return { duplicatesRemoved };
  } catch (err) {
    console.error('[db] Error cleaning up duplicate Gmail records:', err);
    throw err;
  }
}

/**
 * Safe database cleanup routine for Gmail accounts.
 *
 * In development or maintenance, allows purging stale or orphaned GmailAccount records
 * created prior to browser-scoped session isolation.
 * If olderThanHours is provided, only accounts inactive for that duration are removed.
 */
export async function cleanupStaleGmailAccounts(
  options: { olderThanHours?: number; wipeAll?: boolean } = {}
): Promise<{ deletedCount: number }> {
  try {
    const filter: Record<string, unknown> = {};
    if (!options.wipeAll && options.olderThanHours) {
      const cutoff = new Date(Date.now() - options.olderThanHours * 3600 * 1000);
      filter['updatedAt'] = { $lt: cutoff };
    }
    const result = await GmailAccountModel.deleteMany(filter);
    return { deletedCount: result.deletedCount || 0 };
  } catch (err) {
    console.error('[db] Error cleaning up stale Gmail accounts:', err);
    throw err;
  }
}

/**
 * Migration cleanup routine to collapse any duplicate AnalysisReport records
 * down to the most recent one (by timestamp).
 */
export async function cleanupDuplicateAnalysisReports(): Promise<{ duplicatesRemoved: number }> {
  try {
    const duplicates = await AnalysisReportModel.aggregate([
      {
        $group: {
          _id: '$messageId',
          count: { $sum: 1 },
          docs: { $push: { id: '$_id', timestamp: '$timestamp' } },
        },
      },
      { $match: { count: { $gt: 1 } } },
    ]);

    let duplicatesRemoved = 0;

    for (const group of duplicates) {
      const sorted = group.docs.sort(
        (a: { timestamp?: string; id: unknown }, b: { timestamp?: string; id: unknown }) => {
          const timeA = a.timestamp ? new Date(a.timestamp).getTime() : 0;
          const timeB = b.timestamp ? new Date(b.timestamp).getTime() : 0;
          return timeB - timeA;
        }
      );

      // Keep the newest (index 0), delete older duplicates
      const idsToDelete = sorted.slice(1).map((d: { id: unknown }) => d.id);
      const deleteResult = await AnalysisReportModel.deleteMany({ _id: { $in: idsToDelete } });
      duplicatesRemoved += deleteResult.deletedCount || 0;
    }

    return { duplicatesRemoved };
  } catch (err) {
    console.error('[db] Error cleaning up duplicate AnalysisReport records:', err);
    throw err;
  }
}

/**
 * Drops legacy unique indexes (like sparse userId_1_gmailMessageId_1) that conflict
 * with compound partial indexing on .eml uploads where gmailMessageId is null.
 */
export async function fixLegacyEmailAnalysisIndexes(): Promise<void> {
  try {
    if (mongoose.connection.readyState !== 1) return;
    const collection = EmailAnalysisRecordModel.collection;
    const indexes = await collection.indexes();
    const oldIndex = indexes.find((idx) => idx.name === 'userId_1_gmailMessageId_1');
    if (oldIndex && !oldIndex['partialFilterExpression']) {
      await collection.dropIndex('userId_1_gmailMessageId_1');
    }
  } catch {
    // Collection or index might not exist yet; safe to ignore
  }
}

/**
 * Safely synchronizes indexes across forensic models after deduplication cleanup.
 */
export async function syncEmailAnalysisIndexes(): Promise<void> {
  await fixLegacyEmailAnalysisIndexes();
  await cleanupDuplicateGmailRecords();
  await cleanupDuplicateAnalysisReports();
  await EmailAnalysisRecordModel.syncIndexes();
  await AnalysisReportModel.syncIndexes();
  await RawEmailModel.syncIndexes();
  await DomainIntelligenceModel.syncIndexes();
  await UserModel.syncIndexes();
  await SessionModel.syncIndexes();
  await GmailAccountModel.syncIndexes();
  await AnalystFeedbackModel.syncIndexes();
  await OAuthTransactionModel.syncIndexes();
}

// ---------------------------------------------------------------------------
// AnalystFeedback Mongoose schema + model
// ---------------------------------------------------------------------------

export interface AnalystFeedback {
  jobId: string;
  userId?: string;
  feedbackMode?: 'user' | 'expert';
  analystVerdict:
    | 'CONFIRMED_TRUE_POSITIVE'
    | 'CONFIRMED_TRUE_NEGATIVE'
    | 'FALSE_POSITIVE'
    | 'FALSE_NEGATIVE'
    | 'MISCLASSIFIED_SEVERITY'
    | 'USER_ACCURATE'
    | 'USER_FALSE_ALARM'
    | 'USER_MISSED_THREAT'
    | 'USER_UNSURE';
  actualThreatCategory?: string;
  pillarAccuracy?: {
    identityCorrect?: boolean;
    aiIntentCorrect?: boolean;
    cryptoAuthCorrect?: boolean;
    ipReputationCorrect?: boolean;
  };
  suggestedScore?: number;
  userSuspicionLevel?: number;
  userSelectedTriggers?: string[];
  notes?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export type AnalystFeedbackDocument = AnalystFeedback & Document;

const analystFeedbackSchema = new Schema<AnalystFeedbackDocument>(
  {
    jobId: { type: String, required: true },
    userId: { type: String, index: true },
    feedbackMode: { type: String, enum: ['user', 'expert'], default: 'expert' },
    analystVerdict: {
      type: String,
      enum: [
        'CONFIRMED_TRUE_POSITIVE',
        'CONFIRMED_TRUE_NEGATIVE',
        'FALSE_POSITIVE',
        'FALSE_NEGATIVE',
        'MISCLASSIFIED_SEVERITY',
        'USER_ACCURATE',
        'USER_FALSE_ALARM',
        'USER_MISSED_THREAT',
        'USER_UNSURE',
      ],
      required: true,
    },
    actualThreatCategory: { type: String },
    pillarAccuracy: {
      identityCorrect: { type: Boolean },
      aiIntentCorrect: { type: Boolean },
      cryptoAuthCorrect: { type: Boolean },
      ipReputationCorrect: { type: Boolean },
    },
    suggestedScore: { type: Number, min: 0, max: 100 },
    userSuspicionLevel: { type: Number, min: 1, max: 5 },
    userSelectedTriggers: [{ type: String }],
    notes: { type: String },
  },
  { timestamps: true }
);

analystFeedbackSchema.index({ jobId: 1 }, { unique: true });
analystFeedbackSchema.index({ userId: 1, jobId: 1 });

export const AnalystFeedbackModel =
  (mongoose.models?.['AnalystFeedback'] as mongoose.Model<AnalystFeedbackDocument>) ||
  model<AnalystFeedbackDocument>('AnalystFeedback', analystFeedbackSchema);

// ---------------------------------------------------------------------------
// DomainIntelligence Mongoose schema + model
// ---------------------------------------------------------------------------

export interface DomainIntelligenceRecord {
  domain: string;
  registrableDomain: string;
  registration?: {
    createdAt?: Date;
    expiresAt?: Date;
    lastChangedAt?: Date;
  };
  registrar?: {
    name?: string;
    handle?: string;
    ianaId?: string;
    isPrivacyProtected?: boolean;
  };
  rdap: {
    available: boolean;
    source?: string;
    fetchedAt: Date;
    httpStatus?: number;
    error?: string;
  };
  age?: {
    ageDays: number;
    classification: 'VERY_NEW' | 'NEWLY_REGISTERED' | 'RECENT' | 'ESTABLISHED' | 'UNKNOWN';
  };
  expireAt?: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

export type DomainIntelligenceDocument = DomainIntelligenceRecord & Document;

const domainIntelligenceSchema = new Schema<DomainIntelligenceDocument>(
  {
    domain: { type: String, required: true },
    registrableDomain: { type: String, required: true, index: true },
    registration: {
      createdAt: { type: Date },
      expiresAt: { type: Date },
      lastChangedAt: { type: Date },
    },
    registrar: {
      name: { type: String },
      handle: { type: String },
      ianaId: { type: String },
      isPrivacyProtected: { type: Boolean },
    },
    rdap: {
      available: { type: Boolean, required: true },
      source: { type: String },
      fetchedAt: { type: Date, required: true },
      httpStatus: { type: Number },
      error: { type: String },
    },
    age: {
      ageDays: { type: Number },
      classification: {
        type: String,
        enum: ['VERY_NEW', 'NEWLY_REGISTERED', 'RECENT', 'ESTABLISHED', 'UNKNOWN'],
      },
    },
    expireAt: {
      type: Date,
      index: { expires: '24h' },
    },
  },
  { timestamps: true }
);

domainIntelligenceSchema.index({ domain: 1 }, { unique: true });

export const DomainIntelligenceModel =
  (mongoose.models?.['DomainIntelligence'] as mongoose.Model<DomainIntelligenceDocument>) ||
  model<DomainIntelligenceDocument>('DomainIntelligence', domainIntelligenceSchema);

// ---------------------------------------------------------------------------
// User Mongoose schema + model (Mailiac Identity)
// ---------------------------------------------------------------------------

export interface User {
  id: string; // Stable internal Mailiac userId (UUID)
  googleId: string; // Google subject identifier (sub)
  email: string;
  name?: string;
  picture?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export type UserDocument = User & Document;

const userSchema = new Schema<UserDocument>(
  {
    id: { type: String, required: true, unique: true, index: true },
    googleId: { type: String, required: true, unique: true, index: true },
    email: { type: String, required: true, index: true },
    name: { type: String },
    picture: { type: String },
  },
  { timestamps: true }
);

export const UserModel =
  (mongoose.models?.['User'] as mongoose.Model<UserDocument>) ||
  model<UserDocument>('User', userSchema);

// ---------------------------------------------------------------------------
// Session Mongoose schema + model (Mailiac Authenticated Sessions)
// ---------------------------------------------------------------------------

export interface Session {
  id: string; // Session ID (UUID)
  userId: string; // Internal Mailiac userId
  expiresAt: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

export type SessionDocument = Session & Document;

const sessionSchema = new Schema<SessionDocument>(
  {
    id: { type: String, required: true, unique: true, index: true },
    userId: { type: String, required: true, index: true },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true }
);

sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const SessionModel =
  (mongoose.models?.['Session'] as mongoose.Model<SessionDocument>) ||
  model<SessionDocument>('Session', sessionSchema);

// ---------------------------------------------------------------------------
// OAuthTransaction Mongoose schema + model (Short-lived OAuth State Verification)
// ---------------------------------------------------------------------------

export interface OAuthTransaction {
  id: string; // state token (UUID)
  userId?: string;
  sessionId?: string;
  action?: 'login' | 'gmail';
  expiresAt: Date;
  used: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

export type OAuthTransactionDocument = OAuthTransaction & Document;

const oAuthTransactionSchema = new Schema<OAuthTransactionDocument>(
  {
    id: { type: String, required: true, unique: true, index: true },
    userId: { type: String, index: true },
    sessionId: { type: String },
    action: { type: String, enum: ['login', 'gmail'], default: 'gmail' },
    expiresAt: { type: Date, required: true },
    used: { type: Boolean, default: false },
  },
  { timestamps: true }
);

oAuthTransactionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const OAuthTransactionModel =
  (mongoose.models?.['OAuthTransaction'] as mongoose.Model<OAuthTransactionDocument>) ||
  model<OAuthTransactionDocument>('OAuthTransaction', oAuthTransactionSchema);

