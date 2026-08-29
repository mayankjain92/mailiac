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
    messageId: { type: String, required: true, index: true },
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

export const AnalysisReportModel = model<AnalysisReportDocument>(
  'AnalysisReport',
  analysisReportSchema
);

// ---------------------------------------------------------------------------
// GmailAccount Mongoose schema + model
// ---------------------------------------------------------------------------

export interface GmailAccount {
  sessionId: string;
  email: string;
  accessToken: string;
  refreshToken?: string;
  tokenExpiry: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

export type GmailAccountDocument = GmailAccount & Document;

const gmailAccountSchema = new Schema<GmailAccountDocument>(
  {
    sessionId: { type: String, required: true, index: true },
    email: { type: String, required: true },
    accessToken: { type: String, required: true },
    refreshToken: { type: String },
    tokenExpiry: { type: Date, required: true },
  },
  { timestamps: true }
);

export const GmailAccountModel =
  (mongoose.models?.['GmailAccount'] as mongoose.Model<GmailAccountDocument>) ||
  model<GmailAccountDocument>('GmailAccount', gmailAccountSchema);

// ---------------------------------------------------------------------------
// EmailAnalysisRecord Mongoose schema + model (for Unified .EML + Gmail Tracking)
// ---------------------------------------------------------------------------

export interface EmailAnalysisRecord {
  jobId: string;
  source: 'eml' | 'gmail';
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
    source: { type: String, enum: ['eml', 'gmail'], required: true },
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
emailAnalysisRecordSchema.index({ gmailMessageId: 1 }, { unique: true, sparse: true });
emailAnalysisRecordSchema.index({ source: 1, createdAt: -1 });
emailAnalysisRecordSchema.index({ verdict: 1, createdAt: -1 });

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
      { $match: { gmailMessageId: { $exists: true, $ne: null } } },
      {
        $group: {
          _id: '$gmailMessageId',
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
 * Safely synchronizes indexes on EmailAnalysisRecordModel after deduplication cleanup.
 */
export async function syncEmailAnalysisIndexes(): Promise<void> {
  await cleanupDuplicateGmailRecords();
  await EmailAnalysisRecordModel.syncIndexes();
}


