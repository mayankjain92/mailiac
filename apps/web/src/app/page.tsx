'use client';

import React, { useState, useEffect, useCallback } from 'react';
import UploadZone from '@/components/UploadZone';
import ReportViewer from '@/components/ReportViewer';
import type { AnalysisReport } from '@mailiac/shared-types';
import { Mail, Loader2, CheckCircle2, XCircle, FileSpreadsheet, RefreshCw } from 'lucide-react';

interface JobItem {
  id: string;
  fileName: string;
  status: 'queued' | 'active' | 'processing' | 'completed' | 'failed';
  error?: string;
  report?: AnalysisReport;
}

export default function DashboardPage() {
  const [jobs, setJobs] = useState<JobItem[]>([]);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);

  const handleJobCreated = (jobId: string, fileName: string) => {
    const newJob: JobItem = {
      id: jobId,
      fileName,
      status: 'queued'
    };
    setJobs((prev) => [newJob, ...prev]);
    setActiveJobId(jobId);
  };

  const fetchReport = useCallback(async (jobId: string): Promise<boolean> => {
    try {
      const reportRes = await fetch(`/api/reports/${jobId}`);
      if (reportRes.ok) {
        const reportData: AnalysisReport = await reportRes.json();
        setJobs((prev) =>
          prev.map((j) => (j.id === jobId ? { ...j, status: 'completed', report: reportData } : j))
        );
        return true;
      }
    } catch (err) {
      console.error('Failed to fetch report:', err);
    }
    return false;
  }, []);

  // Poll active, queued, or processing jobs, and retry fetching report if completed without report loaded
  useEffect(() => {
    const pendingJobs = jobs.filter(
      (j) =>
        j.status === 'queued' ||
        j.status === 'active' ||
        j.status === 'processing' ||
        (j.status === 'completed' && !j.report)
    );
    if (pendingJobs.length === 0) return;

    const interval = setInterval(async () => {
      for (const job of pendingJobs) {
        try {
          if (job.status === 'completed' && !job.report) {
            await fetchReport(job.id);
            continue;
          }

          const res = await fetch(`/api/jobs/${job.id}`);
          if (!res.ok) continue;

          const data = await res.json();
          const currentStatus = data.status as JobItem['status'];

          if (currentStatus === 'completed') {
            const fetched = await fetchReport(job.id);
            if (!fetched) {
              setJobs((prev) =>
                prev.map((j) => (j.id === job.id ? { ...j, status: 'completed' } : j))
              );
            }
          } else if (currentStatus === 'failed') {
            setJobs((prev) =>
              prev.map((j) =>
                j.id === job.id
                  ? { ...j, status: 'failed', error: data.failedReason || data.error || 'Job processing failed' }
                  : j
              )
            );
          } else {
            setJobs((prev) =>
              prev.map((j) => (j.id === job.id ? { ...j, status: currentStatus } : j))
            );
          }
        } catch {
          // ignore transient poll errors
        }
      }
    }, 800);

    return () => clearInterval(interval);
  }, [jobs, fetchReport]);

  const activeJob = jobs.find((j) => j.id === activeJobId);

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '360px 1fr', gap: '24px', minHeight: 'calc(100vh - 120px)' }}>
      
      {/* Left Sidebar: Upload & Job History */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        <UploadZone onJobCreated={handleJobCreated} />

        {/* Jobs List Panel */}
        <div className="glass-panel" style={{ padding: '20px', flex: 1, display: 'flex', flexDirection: 'column' }}>
          <h3 style={{ fontSize: '15px', fontWeight: 600, marginBottom: '14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <FileSpreadsheet style={{ color: 'var(--accent-cyan)', width: '18px', height: '18px' }} />
              Analysis Jobs ({jobs.length})
            </span>
            {jobs.length > 0 && (
              <span className="font-mono badge-low" style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '4px' }}>
                Live Polling
              </span>
            )}
          </h3>

          {jobs.length === 0 ? (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', textAlign: 'center', padding: '40px 10px' }}>
              <Mail style={{ width: '36px', height: '36px', opacity: 0.4, marginBottom: '10px' }} />
              <p style={{ fontSize: '13px' }}>No email jobs submitted yet.</p>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
                Upload an <code className="font-mono" style={{ color: 'var(--accent-cyan)' }}>.eml</code> file above to trigger forensic pipeline.
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', overflowY: 'auto', maxHeight: '500px' }}>
              {jobs.map((job) => {
                const isActive = job.id === activeJobId;
                const isPending = job.status === 'queued' || job.status === 'active' || job.status === 'processing';
                return (
                  <div
                    key={job.id}
                    onClick={() => setActiveJobId(job.id)}
                    style={{
                      padding: '12px 14px',
                      borderRadius: '8px',
                      background: isActive ? 'rgba(6, 182, 212, 0.12)' : 'rgba(15, 23, 42, 0.4)',
                      border: `1px solid ${isActive ? 'var(--accent-cyan)' : 'var(--border-glass)'}`,
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between'
                    }}
                  >
                    <div style={{ overflow: 'hidden', paddingRight: '8px' }}>
                      <p style={{ fontSize: '13px', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {job.fileName}
                      </p>
                      <p className="font-mono" style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                        {job.id.substring(0, 18)}...
                      </p>
                    </div>

                    <div style={{ flexShrink: 0 }}>
                      {isPending ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--accent-cyan)', fontSize: '12px' }}>
                          <Loader2 style={{ animation: 'spin 1s linear infinite', width: '14px', height: '14px' }} />
                          <span className="font-mono" style={{ fontSize: '11px' }}>{job.status}</span>
                        </div>
                      ) : job.status === 'completed' ? (
                        <CheckCircle2 style={{ color: '#10b981', width: '16px', height: '16px' }} />
                      ) : (
                        <XCircle style={{ color: '#f43f5e', width: '16px', height: '16px' }} />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Right Main Content: Active Job Report Viewer */}
      <div>
        {!activeJob ? (
          <div className="glass-panel" style={{ padding: '60px 20px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '400px' }}>
            <Mail style={{ width: '48px', height: '48px', color: 'var(--accent-cyan)', opacity: 0.5, marginBottom: '16px' }} />
            <h2 style={{ fontSize: '18px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '6px' }}>
              Select or Upload an EML Job
            </h2>
            <p style={{ fontSize: '14px', color: 'var(--text-secondary)', maxWidth: '450px' }}>
              Upload a raw <code className="font-mono" style={{ color: 'var(--accent-cyan)' }}>.eml</code> file on the left panel to execute the 11-stage parallel forensic engine and view 4-pillar risk metrics.
            </p>
          </div>
        ) : activeJob.status === 'queued' || activeJob.status === 'active' || activeJob.status === 'processing' ? (
          <div className="glass-panel" style={{ padding: '60px 20px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '400px' }}>
            <Loader2 style={{ width: '40px', height: '40px', color: 'var(--accent-cyan)', animation: 'spin 1s linear infinite', marginBottom: '16px' }} />
            <h2 style={{ fontSize: '18px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '6px' }}>
              Executing 11-Stage Forensic Pipeline...
            </h2>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
              Status: <span className="font-mono" style={{ color: 'var(--accent-cyan)' }}>{activeJob.status}</span> for <code className="font-mono">{activeJob.fileName}</code>
            </p>
          </div>
        ) : activeJob.status === 'failed' ? (
          <div className="glass-panel" style={{ padding: '40px 24px', border: '1px solid rgba(244, 63, 94, 0.3)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', color: '#f43f5e', marginBottom: '12px' }}>
              <XCircle style={{ width: '24px', height: '24px' }} />
              <h2 style={{ fontSize: '18px', fontWeight: 600 }}>Pipeline Execution Failed</h2>
            </div>
            <p style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>
              {activeJob.error || 'An unexpected error occurred while processing the email.'}
            </p>
          </div>
        ) : activeJob.report ? (
          <ReportViewer report={activeJob.report} />
        ) : (
          <div className="glass-panel" style={{ padding: '40px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px' }}>
            <Loader2 style={{ width: '32px', height: '32px', color: 'var(--accent-cyan)', animation: 'spin 1s linear infinite' }} />
            <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>Loading report details from database...</p>
            <button
              onClick={() => fetchReport(activeJob.id)}
              className="btn-primary"
              style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px' }}
            >
              <RefreshCw style={{ width: '14px', height: '14px' }} />
              Retry Fetching Report
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
