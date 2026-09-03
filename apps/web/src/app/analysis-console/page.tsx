'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function AnalysisConsoleIndexPage(): null {
  const router = useRouter();

  useEffect(() => {
    fetch('/api/reports/history?limit=1')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        const historyList = Array.isArray(data) ? data : data?.reports || [];
        const latest = historyList[0];
        const latestId = latest?.caseId || latest?.messageId || latest?._id;
        if (latestId) {
          router.replace(`/analysis-console/${encodeURIComponent(latestId)}/evidence`);
        } else {
          router.replace('/mailbox');
        }
      })
      .catch(() => {
        router.replace('/mailbox');
      });
  }, [router]);

  return null;
}
