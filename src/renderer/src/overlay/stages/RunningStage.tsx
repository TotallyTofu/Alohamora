import { useEffect } from 'react';
import { Button } from '../../components/Button';
import { ProgressRing } from '../../components/ProgressRing';
import { api } from '../../lib/api';
import { useJob } from '../../lib/useJob';
import { useOverlay } from '../store';

export function RunningStage({ jobId }: { jobId: string }) {
  const job = useJob(jobId);
  const go = useOverlay((s) => s.go);
  const first = useOverlay((s) => s.files[0]);

  useEffect(() => {
    if (!job) return;
    if (job.status === 'done') go({ name: 'done', job });
    else if (job.status === 'error') go({ name: 'error', message: job.error ?? 'Something went wrong.', details: job.errorDetails });
    else if (job.status === 'canceled') void api.closeOverlay();
  }, [job, go]);

  const pct = Math.round((job?.progress ?? 0) * 100);
  return (
    <div className="card">
      <ProgressRing value={job?.progress ?? 0} size={104}>
        {first?.thumbnail ? <img src={first.thumbnail} alt="" /> : <span>{pct}%</span>}
      </ProgressRing>
      <h2 className="status__title">{job?.label ?? 'Starting…'}</h2>
      <p className="status__sub">{job?.detail ?? first?.name} · {pct}%</p>
      <Button variant="soft" onClick={() => void api.cancelJob(jobId)}>Cancel</Button>
    </div>
  );
}
