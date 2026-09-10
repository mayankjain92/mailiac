'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

import { api } from '@/lib/api';

export default function AnalysisConsoleIndexPage(): null {
  const router = useRouter();

  useEffect(() => {
    api.get('/api/reports/history', { params: { limit: 1 } })
      .then((res) => {
        const data = res.data;
        const historyList = Array.isArray(data) ? data : data?.records || data?.reports || [];
        const latest = historyList[0];
        const latestId = latest?.caseId || latest?.messageId || latest?.jobId || latest?._id;
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
