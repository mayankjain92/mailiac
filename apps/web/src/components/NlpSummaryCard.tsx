'use client';

import React from 'react';
import type { AnalysisReport } from '@mailiac/shared-types';
import { 
  BrainCircuit, 
  ShieldAlert, 
  CheckCircle2, 
  AlertTriangle, 
  Hash, 
  Zap, 
  Cpu,
  Layers,
  Activity
} from 'lucide-react';

interface NlpSummaryCardProps {
  summary: AnalysisReport['aiSummary'];
}

export default function NlpSummaryCard({ summary }: NlpSummaryCardProps) {
  if (!summary) return null;

  const urgencyScore = summary.urgency ?? 0;
  const confidenceScore = Math.round((summary.confidence ?? 0) * 100);

  let urgencyColor = '#10b981';
  let urgencyLabel = 'LOW URGENCY';
  if (urgencyScore > 75) {
    urgencyColor = '#f43f5e';
    urgencyLabel = 'HIGH PRESSURE / CRITICAL';
  } else if (urgencyScore > 35) {
    urgencyColor = '#f59e0b';
    urgencyLabel = 'MODERATE URGENCY';
  }

  const isFallback = summary.providerStatus === 'fallback';

  return (
    <div className="glass-panel" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
      
      {/* Header Banner */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', borderBottom: '1px solid var(--border-glass)', paddingBottom: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <BrainCircuit style={{ color: '#ec4899', width: '22px', height: '22px' }} />
          <div>
            <h3 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)' }}>
              Semantic NLP & Fraud Intent Intelligence
            </h3>
            <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
              De-cloaked Contextual Analysis & Threat Vector Classification
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span className="font-mono" style={{ 
            fontSize: '11px', 
            fontWeight: 700, 
            padding: '4px 10px', 
            borderRadius: '6px',
            background: isFallback ? 'rgba(245, 158, 11, 0.15)' : 'rgba(236, 72, 153, 0.15)',
            color: isFallback ? '#f59e0b' : '#ec4899',
            border: `1px solid ${isFallback ? 'rgba(245, 158, 11, 0.3)' : 'rgba(236, 72, 153, 0.3)'}`,
            display: 'flex',
            alignItems: 'center',
            gap: '6px'
          }}>
            <Cpu style={{ width: '13px', height: '13px' }} />
            {summary.provider ? `${summary.provider.toUpperCase()} NLP ENGINE` : 'SEMANTIC NLP'}
          </span>

          <span className="font-mono" style={{
            fontSize: '11px',
            padding: '4px 10px',
            borderRadius: '6px',
            background: summary.providerStatus === 'success' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(148, 163, 184, 0.15)',
            color: summary.providerStatus === 'success' ? '#10b981' : '#94a3b8'
          }}>
            {summary.providerStatus?.toUpperCase() || 'PROCESSED'}
          </span>
        </div>
      </div>

      {/* Metrics Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px' }}>
        
        {/* Urgency Gauge */}
        <div style={{ background: 'rgba(15, 23, 42, 0.5)', padding: '16px', borderRadius: '10px', border: '1px solid var(--border-glass)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Zap style={{ width: '14px', height: '14px', color: urgencyColor }} />
              Psychological Urgency
            </span>
            <span className="font-mono" style={{ fontSize: '14px', fontWeight: 700, color: urgencyColor }}>
              {urgencyScore}/100
            </span>
          </div>

          <div style={{ width: '100%', height: '6px', background: 'rgba(255, 255, 255, 0.08)', borderRadius: '3px', overflow: 'hidden' }}>
            <div style={{ width: `${urgencyScore}%`, height: '100%', background: urgencyColor, transition: 'width 0.4s ease' }} />
          </div>
          <span style={{ fontSize: '11px', color: urgencyColor, display: 'block', marginTop: '6px', fontWeight: 500 }}>
            {urgencyLabel}
          </span>
        </div>

        {/* Confidence Level */}
        <div style={{ background: 'rgba(15, 23, 42, 0.5)', padding: '16px', borderRadius: '10px', border: '1px solid var(--border-glass)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Activity style={{ width: '14px', height: '14px', color: 'var(--accent-cyan)' }} />
              Analysis Confidence
            </span>
            <span className="font-mono" style={{ fontSize: '14px', fontWeight: 700, color: 'var(--accent-cyan)' }}>
              {confidenceScore}%
            </span>
          </div>

          <div style={{ width: '100%', height: '6px', background: 'rgba(255, 255, 255, 0.08)', borderRadius: '3px', overflow: 'hidden' }}>
            <div style={{ width: `${confidenceScore}%`, height: '100%', background: 'var(--accent-cyan)', transition: 'width 0.4s ease' }} />
          </div>
          <span style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'block', marginTop: '6px' }}>
            High Precision Classification
          </span>
        </div>

        {/* Engine Diagnostics */}
        <div style={{ background: 'rgba(15, 23, 42, 0.5)', padding: '16px', borderRadius: '10px', border: '1px solid var(--border-glass)' }}>
          <span style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
            <Layers style={{ width: '14px', height: '14px', color: '#8b5cf6' }} />
            Pipeline Diagnostics
          </span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-muted)' }}>Latency:</span>
              <span className="font-mono" style={{ color: 'var(--text-primary)' }}>
                {summary.aiDiagnostics?.latencyMs !== undefined ? `${summary.aiDiagnostics.latencyMs} ms` : 'Fast'}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-muted)' }}>Fallback Executed:</span>
              <span className="font-mono" style={{ color: isFallback ? '#f59e0b' : '#10b981' }}>
                {isFallback ? 'Yes' : 'No'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Detected Threat Vectors (Intent Badges) */}
      <div style={{ background: 'rgba(15, 23, 42, 0.4)', padding: '16px', borderRadius: '10px', border: '1px solid var(--border-glass)' }}>
        <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', display: 'block', marginBottom: '10px' }}>
          Classified Threat Vectors & Intent Signals
        </span>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
          {summary.intent && summary.intent.length > 0 ? (
            summary.intent.map((intentTag, i) => (
              <div 
                key={i} 
                style={{
                  background: 'rgba(244, 63, 94, 0.12)',
                  border: '1px solid rgba(244, 63, 94, 0.3)',
                  padding: '6px 12px',
                  borderRadius: '6px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                <ShieldAlert style={{ width: '14px', height: '14px', color: '#f43f5e' }} />
                <span className="font-mono" style={{ fontSize: '12px', fontWeight: 600, color: '#f43f5e' }}>
                  {intentTag.toUpperCase()}
                </span>
              </div>
            ))
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#10b981', background: 'rgba(16, 185, 129, 0.1)', padding: '8px 14px', borderRadius: '6px' }}>
              <CheckCircle2 style={{ width: '16px', height: '16px' }} />
              <span style={{ fontSize: '12px', fontWeight: 500 }}>No Malicious Intent Detected (Safe / Benign Payload)</span>
            </div>
          )}
        </div>
      </div>

      {/* Specific Fraud Findings List (if any) */}
      {summary.findings && summary.findings.length > 0 && (
        <div style={{ background: 'rgba(15, 23, 42, 0.4)', padding: '16px', borderRadius: '10px', border: '1px solid var(--border-glass)' }}>
          <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', display: 'block', marginBottom: '10px' }}>
            NLP Engine Detailed Findings ({summary.findings.length})
          </span>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {summary.findings.map((finding, idx) => (
              <div 
                key={idx}
                style={{
                  padding: '10px 12px',
                  borderRadius: '6px',
                  background: 'rgba(0, 0, 0, 0.25)',
                  border: '1px solid rgba(255, 255, 255, 0.05)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '10px'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <AlertTriangle style={{ width: '14px', height: '14px', color: '#f59e0b', flexShrink: 0 }} />
                  <div>
                    <span className="font-mono" style={{ fontSize: '11px', fontWeight: 600, color: '#ec4899', display: 'inline-block', marginRight: '8px' }}>
                      {finding.type}
                    </span>
                    <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                      {finding.description}
                    </span>
                  </div>
                </div>
                <span className="font-mono" style={{ fontSize: '10px', padding: '2px 6px', borderRadius: '4px', background: 'rgba(244, 63, 94, 0.2)', color: '#f43f5e', flexShrink: 0 }}>
                  {finding.severity}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Payload Integrity Signature Footer */}
      <div style={{ background: 'rgba(15, 23, 42, 0.3)', padding: '12px 16px', borderRadius: '8px', border: '1px solid var(--border-glass)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
        <span style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Hash style={{ width: '14px', height: '14px', color: 'var(--accent-cyan)' }} />
          Payload Cryptographic Hash (SHA-256)
        </span>
        <code className="font-mono" style={{ fontSize: '11px', color: 'var(--accent-cyan)', background: 'rgba(6, 182, 212, 0.1)', padding: '4px 8px', borderRadius: '4px' }}>
          {summary.integrityHash || 'UNHASHED_PAYLOAD'}
        </code>
      </div>

    </div>
  );
}
