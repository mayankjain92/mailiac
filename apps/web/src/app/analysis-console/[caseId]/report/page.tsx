'use client';

import React, { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowRight, FileText, Loader2 } from 'lucide-react';

export default function CaseReportRedirectPage(): React.JSX.Element {
  const params = useParams();
  const router = useRouter();
  const rawCaseId = params?.['caseId'];
  const caseId = Array.isArray(rawCaseId) ? rawCaseId[0] : rawCaseId;

  useEffect(() => {
    if (caseId) {
      router.replace(`/forensic-analysis?jobId=${encodeURIComponent(caseId)}`);
    }
  }, [caseId, router]);

  return (
    <div className="min-h-screen bg-[#F2F2EE] dark:bg-[#0E1210] flex flex-col items-center justify-center p-6 text-center font-mono">
      <Loader2 className="w-6 h-6 animate-spin text-[#0052ff] dark:text-[#3b82f6] mb-4" />
      <p className="text-xs text-[#737688] dark:text-[#A0A7A3] mb-4">
        Redirecting to Case <strong className="text-[#0052ff] dark:text-[#3b82f6]">{caseId}</strong> Report...
      </p>
      <Link
        href={`/analysis-console/${caseId}/evidence`}
        className="inline-flex items-center gap-2 text-xs text-[#0052ff] dark:text-[#3b82f6] font-bold hover:underline"
      >
        <FileText className="w-4 h-4" /> Jump directly to Full Evidence Explorer <ArrowRight className="w-3.5 h-3.5" />
      </Link>
    </div>
  );
}
