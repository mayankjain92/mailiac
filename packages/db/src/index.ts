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
