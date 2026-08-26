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
