'use client';

import React, { useState, useRef } from 'react';
import { UploadCloud, FileText, AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';

interface UploadZoneProps {
  onJobCreated: (jobId: string, fileName: string) => void;
}

export default function UploadZone({ onJobCreated }: UploadZoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      processFile(file);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      processFile(e.target.files[0]);
    }
  };

  const processFile = (file: File) => {
    setError(null);
    if (!file.name.endsWith('.eml') && file.type !== 'message/rfc822') {
      setError('Please select a valid .eml file format.');
      return;
    }
    setSelectedFile(file);
  };

  const handleUpload = async () => {
    if (!selectedFile) return;

    setIsUploading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('eml', selectedFile);

      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errJson = await response.json().catch(() => ({}));
        throw new Error(errJson.error || `Upload failed with status ${response.status}`);
      }

      const data = await response.json();
      if (!data.jobId) {
        throw new Error('No jobId returned from API server');
      }

      onJobCreated(data.jobId, selectedFile.name);
      setSelectedFile(null);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to upload email for forensic analysis.';
      setError(message);
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="glass-panel" style={{ padding: '24px' }}>
      <h2 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
        <UploadCloud style={{ color: 'var(--accent-cyan)', width: '20px', height: '20px' }} />
        Upload Email Sample (.eml)
      </h2>

      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        style={{
          border: `2px dashed ${isDragging ? 'var(--accent-cyan)' : 'rgba(255, 255, 255, 0.15)'}`,
          borderRadius: '12px',
          padding: '36px 20px',
          textAlign: 'center',
          background: isDragging ? 'rgba(6, 182, 212, 0.08)' : 'rgba(15, 23, 42, 0.4)',
          cursor: 'pointer',
          transition: 'all 0.2s ease',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '12px'
        }}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".eml,message/rfc822"
          onChange={handleFileSelect}
          style={{ display: 'none' }}
        />

        <div style={{
          width: '48px',
          height: '48px',
          borderRadius: '50%',
          background: 'rgba(6, 182, 212, 0.12)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--accent-cyan)'
        }}>
          <UploadCloud style={{ width: '24px', height: '24px' }} />
        </div>

        <div>
          <p style={{ fontWeight: 500, fontSize: '15px', color: 'var(--text-primary)', marginBottom: '4px' }}>
            Drag and drop your raw <code className="font-mono" style={{ color: 'var(--accent-cyan)' }}>.eml</code> file here
          </p>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
            or click to browse your computer
          </p>
        </div>
      </div>

      {selectedFile && (
        <div style={{
          marginTop: '16px',
          padding: '12px 16px',
          background: 'rgba(30, 41, 59, 0.6)',
          borderRadius: '8px',
          border: '1px solid var(--border-glass)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <FileText style={{ color: 'var(--accent-cyan)', width: '18px', height: '18px' }} />
            <div>
              <p style={{ fontSize: '14px', fontWeight: 500 }}>{selectedFile.name}</p>
              <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{(selectedFile.size / 1024).toFixed(1)} KB</p>
            </div>
          </div>

          <button
            onClick={(e) => {
              e.stopPropagation();
              handleUpload();
            }}
            disabled={isUploading}
            className="btn-primary"
            style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
          >
            {isUploading ? (
              <>
                <Loader2 style={{ animation: 'spin 1s linear infinite', width: '16px', height: '16px' }} />
                Analyzing...
              </>
            ) : (
              <>
                <CheckCircle2 style={{ width: '16px', height: '16px' }} />
                Run Pipeline
              </>
            )}
          </button>
        </div>
      )}

      {error && (
        <div style={{
          marginTop: '12px',
          padding: '10px 14px',
          background: 'rgba(244, 63, 94, 0.1)',
          border: '1px solid rgba(244, 63, 94, 0.3)',
          borderRadius: '8px',
          color: '#fb7185',
          fontSize: '13px',
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        }}>
          <AlertCircle style={{ width: '16px', height: '16px', flexShrink: 0 }} />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
}
