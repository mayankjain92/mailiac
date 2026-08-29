'use client';

import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';

export default function AnalysisConsoleCaseIndexPage(): null {
  const params = useParams();
  const router = useRouter();
  const rawCaseId = params?.['caseId'];
  const caseId = Array.isArray(rawCaseId) ? rawCaseId[0] : rawCaseId;

  useEffect(() => {
    if (caseId) {
      router.replace(`/analysis-console/${encodeURIComponent(caseId)}/evidence`);
    }
  }, [caseId, router]);

  return null;
}
