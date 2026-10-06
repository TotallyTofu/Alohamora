import { useEffect, useState } from 'react';
import type { JobUpdate } from '@shared/types';
import { api } from './api';

export function useJob(jobId: string | null): JobUpdate | null {
  const [job, setJob] = useState<JobUpdate | null>(null);
  useEffect(() => {
    if (!jobId) return;
    let alive = true;
    void api.listJobs().then((list) => { const j = list.find((x) => x.id === jobId); if (alive && j) setJob(j); });
    const off = api.onJobUpdate((u) => { if (u.id === jobId) setJob(u); });
    return () => { alive = false; off(); };
  }, [jobId]);
  return job;
}
