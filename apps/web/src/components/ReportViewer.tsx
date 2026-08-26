'use client';

import React from 'react';
import type { AnalysisReport, Finding } from '@mailiac/shared-types';
import ForensicPath from './ForensicPath';
import NlpSummaryCard from './NlpSummaryCard';
import { 
  Clock, 
  Lock, 
  UserCheck, 
  Globe2, 
  BrainCircuit, 
  Fingerprint,
  AlertTriangle,
  ShieldAlert,
  CheckCircle2,
  FileText,
  Activity
} from 'lucide-react';

interface ReportViewerProps {
  report: AnalysisReport;
}

export default function ReportViewer({ report }: ReportViewerProps) {
  const finalScore = report.riskMatrix?.finalScore ?? 0;
  
  let verdictLabel = 'CLEAN / LOW RISK';
  let verdictClass = 'badge-low';
  let verdictColor = '#10b981';

  if (finalScore >= 80) {
    verdictLabel = 'HIGH RISK QUARANTINE';
    verdictClass = 'badge-high';
    verdictColor = '#f43f5e';
  } else if (finalScore >= 31) {
    verdictLabel = 'SUSPICIOUS';
    verdictClass = 'badge-medium';
    verdictColor = '#f59e0b';
  }

  // Collect all findings across pillars and aiSummary
  const allPillars = report.riskMatrix?.pillars;
  const authFindings = allPillars?.authentication?.findings || report.authResults?.findings || [];
  const identityFindings = allPillars?.identity?.findings || [];
  const infraFindings = allPillars?.infrastructure?.findings || [];
  const nlpFindings = allPillars?.nlp?.findings || report.aiSummary?.findings || [];

  const allFindings: { pillar: string; finding: Finding }[] = [
    ...authFindings.map(f => ({ pillar: 'Authentication', finding: f })),
    ...identityFindings.map(f => ({ pillar: 'Identity', finding: f })),
    ...infraFindings.map(f => ({ pillar: 'Infrastructure', finding: f })),
    ...nlpFindings.map(f => ({ pillar: 'NLP & Intent', finding: f })),
  ];

  const getSeverityBadge = (severity: Finding['severity']) => {
    switch (severity) {
      case 'HIGH':
        return <span className="font-mono badge-high" style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '4px' }}>HIGH RISK</span>;
      case 'MEDIUM':
        return <span className="font-mono badge-medium" style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '4px' }}>MEDIUM</span>;
      case 'LOW':
        return <span className="font-mono badge-low" style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '4px' }}>LOW</span>;
      default:
        return <span className="font-mono" style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '4px', background: 'rgba(148, 163, 184, 0.2)', color: '#94a3b8' }}>INFO</span>;
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Overview Top Banner */}
      <div className="glass-panel glass-panel-glow" style={{ padding: '28px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '20px' }}>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
            {/* Risk Gauge Circle */}
            <div style={{
              width: '80px',
              height: '80px',
              borderRadius: '50%',
              background: `radial-gradient(closest-side, #0b0f19 79%, transparent 80% 100%), conic-gradient(${verdictColor} ${finalScore}%, rgba(255, 255, 255, 0.1) 0)`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              position: 'relative',
              flexShrink: 0
            }}>
              <span style={{ fontSize: '24px', fontWeight: 800, color: verdictColor }}>
                {finalScore}
              </span>
            </div>

            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
                <span className={`font-mono ${verdictClass}`} style={{ fontSize: '13px', fontWeight: 700, padding: '4px 12px', borderRadius: '6px', letterSpacing: '0.5px' }}>
                  {verdictLabel}
                </span>
                {report.executionTimeMs !== undefined && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '13px', color: 'var(--accent-cyan)' }}>
                    <Clock style={{ width: '14px', height: '14px' }} />
                    <span className="font-mono">{report.executionTimeMs} ms</span> pipeline latency
                  </span>
                )}
              </div>
              <h1 style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text-primary)' }}>
                Sender Domain: <span className="font-mono" style={{ color: 'var(--accent-cyan)' }}>{report.senderDomain || 'Unknown'}</span>
              </h1>
              <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '2px' }}>
                Message ID: <span className="font-mono">{report.messageId}</span>
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
            <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Analysis Timestamp</span>
            <span className="font-mono" style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
              {new Date(report.timestamp).toLocaleString()}
            </span>
          </div>
        </div>
      </div>

      {/* Override Alert Banner (if triggered) */}
      {(report.riskMatrix?.quarantineOverride || report.riskMatrix?.override?.triggered) && (
        <div style={{
          background: 'rgba(244, 63, 94, 0.12)',
          border: '1px solid rgba(244, 63, 94, 0.4)',
          borderRadius: '12px',
          padding: '16px 20px',
          display: 'flex',
          alignItems: 'center',
          gap: '14px'
        }}>
          <ShieldAlert style={{ width: '28px', height: '28px', color: '#f43f5e', flexShrink: 0 }} />
          <div>
            <h4 style={{ fontSize: '14px', fontWeight: 700, color: '#f43f5e', marginBottom: '2px' }}>
              CRITICAL CIRCUIT-BREAKER OVERRIDE TRIGGERED
            </h4>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
              {report.riskMatrix?.override?.reason || 'Critical security policy violation detected. Forced quarantine applied.'}
            </p>
          </div>
        </div>
      )}

      {/* 4-Pillar Risk Score Cards Grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
        gap: '16px'
      }}>
        {/* 1. Auth Score */}
        <div className="glass-panel" style={{ padding: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--accent-cyan)' }}>
              <Lock style={{ width: '18px', height: '18px' }} />
              <h3 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)' }}>Auth Score</h3>
            </div>
            <span className="font-mono" style={{ fontSize: '18px', fontWeight: 700, color: report.riskMatrix?.authScore > 30 ? '#f43f5e' : '#10b981' }}>
              {report.riskMatrix?.authScore ?? 0}/100
            </span>
          </div>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '13px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-secondary)' }}>SPF Validation</span>
              <span className="font-mono" style={{ fontWeight: 600, color: report.authResults?.spf === 'pass' ? '#10b981' : '#f43f5e' }}>
                {report.authResults?.spf?.toUpperCase() ?? 'NONE'}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-secondary)' }}>DKIM Verification</span>
              <span className="font-mono" style={{ fontWeight: 600, color: report.authResults?.dkim === 'pass' ? '#10b981' : '#f43f5e' }}>
                {report.authResults?.dkim?.toUpperCase() ?? 'NONE'}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-secondary)' }}>DMARC Alignment</span>
              <span className="font-mono" style={{ color: 'var(--accent-cyan)' }}>
                {report.authResults?.dmarcAlignment?.toUpperCase() ?? 'FAIL'}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-secondary)' }}>Multi-Hop ARC</span>
              <span className="font-mono" style={{ color: report.authResults?.arcPass ? '#10b981' : '#94a3b8' }}>
                {report.authResults?.arcPass ? 'PASS' : 'UNVERIFIED'}
              </span>
            </div>
          </div>
        </div>

        {/* 2. Identity Score */}
        <div className="glass-panel" style={{ padding: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#8b5cf6' }}>
              <UserCheck style={{ width: '18px', height: '18px' }} />
              <h3 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)' }}>Identity Score</h3>
            </div>
            <span className="font-mono" style={{ fontSize: '18px', fontWeight: 700, color: report.riskMatrix?.identityScore > 30 ? '#f43f5e' : '#10b981' }}>
              {report.riskMatrix?.identityScore ?? 0}/100
            </span>
          </div>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '13px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-secondary)' }}>Spoofing Threat</span>
              <span style={{ color: report.riskMatrix?.identityScore > 0 ? '#f43f5e' : '#10b981', fontWeight: 600 }}>
                {report.riskMatrix?.identityScore > 0 ? 'HIGH IMPERSONATION' : 'VERIFIED'}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-secondary)' }}>Homoglyph Attack</span>
              <span className="font-mono" style={{ color: '#94a3b8' }}>None Detected</span>
            </div>
          </div>
        </div>

        {/* 3. IP Reputation Score */}
        <div className="glass-panel" style={{ padding: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#f59e0b' }}>
              <Globe2 style={{ width: '18px', height: '18px' }} />
              <h3 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)' }}>IP Rep Score</h3>
            </div>
            <span className="font-mono" style={{ fontSize: '18px', fontWeight: 700, color: report.riskMatrix?.ipScore > 30 ? '#f43f5e' : '#10b981' }}>
              {report.riskMatrix?.ipScore ?? 0}/100
            </span>
          </div>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '13px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-secondary)' }}>Origin Hops</span>
              <span className="font-mono" style={{ color: 'var(--text-primary)' }}>{report.forensicPath?.length ?? 0} Nodes</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-secondary)' }}>Untrusted Nodes</span>
              <span className="font-mono" style={{ color: '#f59e0b' }}>
                {report.forensicPath?.filter(h => !h.trusted).length ?? 0} Hops
              </span>
            </div>
          </div>
        </div>

        {/* 4. NLP Intent Score */}
        <div className="glass-panel" style={{ padding: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#ec4899' }}>
              <BrainCircuit style={{ width: '18px', height: '18px' }} />
              <h3 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)' }}>NLP Intent Score</h3>
            </div>
            <span className="font-mono" style={{ fontSize: '18px', fontWeight: 700, color: report.riskMatrix?.nlpScore > 30 ? '#f43f5e' : '#10b981' }}>
              {report.riskMatrix?.nlpScore ?? 0}/100
            </span>
          </div>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '13px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-secondary)' }}>Urgency Meter</span>
              <span className="font-mono" style={{ fontWeight: 600, color: report.aiSummary?.urgency > 50 ? '#f43f5e' : '#10b981' }}>
                {report.aiSummary?.urgency ?? 0}/100
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-secondary)' }}>Threat Intent</span>
              <span className="font-mono" style={{ color: '#fb7185' }}>
                {report.aiSummary?.intent?.join(', ') || 'BENIGN'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Detailed Forensic & Fraud Detection Reasons */}
      <div className="glass-panel" style={{ padding: '24px' }}>
        <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Activity style={{ color: 'var(--accent-cyan)', width: '20px', height: '20px' }} />
          Forensic Evidence & Threat Vector Reasons ({allFindings.length})
        </h3>

        {allFindings.length === 0 ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: '#10b981', background: 'rgba(16, 185, 129, 0.1)', padding: '14px', borderRadius: '8px' }}>
            <CheckCircle2 style={{ width: '18px', height: '18px' }} />
            <span style={{ fontSize: '13px' }}>No security violations or fraud triggers detected across all 4 pillars.</span>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {allFindings.map((item, idx) => (
              <div 
                key={idx}
                style={{
                  background: 'rgba(15, 23, 42, 0.5)',
                  border: '1px solid var(--border-glass)',
                  borderRadius: '8px',
                  padding: '12px 16px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '12px'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <AlertTriangle style={{ width: '16px', height: '16px', color: item.finding.severity === 'HIGH' ? '#f43f5e' : item.finding.severity === 'MEDIUM' ? '#f59e0b' : 'var(--accent-cyan)' }} />
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '2px' }}>
                      <span className="font-mono" style={{ fontSize: '11px', color: 'var(--accent-cyan)', fontWeight: 600 }}>
                        [{item.pillar.toUpperCase()}]
                      </span>
                      <span className="font-mono" style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)' }}>
                        {item.finding.type}
                      </span>
                    </div>
                    <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                      {item.finding.description}
                    </p>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                  {item.finding.source && (
                    <span className="font-mono" style={{ fontSize: '10px', color: 'var(--text-muted)', background: 'rgba(255, 255, 255, 0.05)', padding: '2px 6px', borderRadius: '4px' }}>
                      {item.finding.source}
                    </span>
                  )}
                  {getSeverityBadge(item.finding.severity)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* NLP Intent & Fraud Intelligence Component */}
      {report.aiSummary && (
        <NlpSummaryCard summary={report.aiSummary} />
      )}

      {/* Reverse Hop Forensic Chain Map */}
      <div className="glass-panel" style={{ padding: '24px' }}>
        <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Fingerprint style={{ color: 'var(--accent-cyan)', width: '20px', height: '20px' }} />
          Reverse Hop Network Trace & PTR Validation
        </h3>
        <ForensicPath forensicPath={report.forensicPath || []} />
      </div>

      {/* Basic Testing Raw JSON Dump */}
      <div className="glass-panel" style={{ padding: '24px', overflowX: 'auto' }}>
        <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '16px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <FileText style={{ width: '18px', height: '18px' }} />
          Raw Report Payload (Testing)
        </h3>
        <pre className="font-mono" style={{ fontSize: '11px', color: 'var(--text-secondary)', background: 'rgba(0,0,0,0.3)', padding: '16px', borderRadius: '8px' }}>
          {JSON.stringify(report, null, 2)}
        </pre>
      </div>
    </div>
  );
}
