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
    <div className="bg-[#F2F2EE] dark:bg-[#1B211E] border border-[#D5D5CE] dark:border-[#29342F] p-6 rounded shadow-sm forensic-card bracket-tl transition-colors duration-200">
      <div className="text-xs font-mono font-bold text-[#0052ff] dark:text-[#3b82f6] uppercase tracking-widest mb-3 flex items-center gap-2">
        <UploadCloud className="w-4 h-4 text-[#0052ff] dark:text-[#3b82f6]" />
        EML SAMPLE INGESTION
      </div>

      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`border-2 border-dashed rounded-md p-8 text-center cursor-pointer transition-all duration-200 flex flex-col items-center gap-3 ${
          isDragging
            ? 'border-[#0052ff] dark:border-[#3b82f6] bg-[#0052ff]/10 dark:bg-[#3b82f6]/20'
            : 'border-[#D5D5CE] dark:border-[#29342F] hover:border-[#0052ff] dark:hover:border-[#3b82f6] bg-[#EAEAE5] dark:bg-[#151A17]'
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".eml,message/rfc822"
          onChange={handleFileSelect}
          className="hidden"
        />

        <div className="w-12 h-12 rounded-full bg-[#0052ff]/10 dark:bg-[#3b82f6]/20 flex items-center justify-center text-[#0052ff] dark:text-[#3b82f6]">
          <UploadCloud className="w-6 h-6" />
        </div>

        <div>
          <p className="font-semibold text-sm text-[#1a1c1c] dark:text-[#F2F2EE] mb-1">
            Drag & drop raw <code className="font-mono text-[#0052ff] dark:text-[#3b82f6] font-bold">.eml</code> file
          </p>
          <p className="text-xs text-[#737688] dark:text-[#A0A7A3]">
            or click to select file from your workstation
          </p>
        </div>
      </div>

      {selectedFile && (
        <div className="mt-4 p-3 bg-[#EAEAE5] dark:bg-[#151A17] rounded border border-[#D5D5CE] dark:border-[#29342F] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <FileText className="w-4 h-4 text-[#0052ff] dark:text-[#3b82f6]" />
            <div>
              <p className="text-xs font-bold text-[#1a1c1c] dark:text-[#F2F2EE] font-mono">{selectedFile.name}</p>
              <p className="text-[11px] text-[#737688] dark:text-[#A0A7A3] font-mono">{(selectedFile.size / 1024).toFixed(1)} KB</p>
            </div>
          </div>

          <button
            onClick={(e) => {
              e.stopPropagation();
              handleUpload();
            }}
            disabled={isUploading}
            className="bg-[#0052ff] dark:bg-[#3b82f6] text-white text-xs font-semibold px-4 py-2 rounded hover:bg-[#004ced] dark:hover:bg-[#2563eb] transition-colors flex items-center gap-2 disabled:opacity-50"
          >
            {isUploading ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Ingesting...
              </>
            ) : (
              <>
                <CheckCircle2 className="w-3.5 h-3.5" />
                Start Forensics
              </>
            )}
          </button>
        </div>
      )}

      {error && (
        <div className="mt-3 p-3 bg-[#ffdad6] dark:bg-[#410e0b] border border-[#ba1a1a]/30 rounded text-[#93000a] dark:text-[#ffb4ab] text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
}
