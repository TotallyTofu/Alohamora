import { useEffect, useState } from 'react';
import { formatBytes } from '@shared/time';
import type { JobUpdate } from '@shared/types';
import { Button } from '../components/Button';
import { Icon } from '../components/Icon';
import { api } from '../lib/api';
import { baseName } from '../lib/format';
import { revealLabel } from '../lib/platform';

const MAX_ROWS = 20;
const isActive = (j: JobUpdate): boolean => j.status === 'running' || j.status === 'queued';

function StatusIcon({ status }: { status: JobUpdate['status'] }) {
  if (status === 'done') return <span className="activity__icon activity__icon--ok"><Icon name="check" size={16} /></span>;
  if (status === 'error') return <span className="activity__icon activity__icon--err"><Icon name="alert" size={16} /></span>;
  if (status === 'canceled') return <span className="activity__icon"><Icon name="close" size={16} /></span>;
  return <span className="activity__icon activity__icon--spin" aria-label="Working" />;
}

function ActivityRow({ job }: { job: JobUpdate }) {
  const running = isActive(job);
  const first = job.request.inputs[0];
  const extra = job.request.inputs.length - 1;
  const name = `${first ? baseName(first) : ''}${extra > 0 ? ` +${extra}` : ''}`;
  const doneNote = [job.note, job.outputBytes ? formatBytes(job.outputBytes) : ''].filter(Boolean).join(' · ');
  return (
    <li className="activity__row">
      <StatusIcon status={job.status} />
      <div className="activity__main">
        <div className="activity__title"><strong>{job.label}</strong> <span className="activity__file">{name}</span></div>
        {running && (
          <div className="activity__bar" role="progressbar" aria-valuenow={Math.round(job.progress * 100)} aria-valuemin={0} aria-valuemax={100}>
            <span style={{ width: `${Math.round(job.progress * 100)}%` }} />
          </div>
        )}
        {job.status === 'done' && doneNote && <div className="activity__note" title={doneNote}>{doneNote}</div>}
        {job.status === 'error' && <div className="activity__note activity__note--err" title={job.error}>{job.error}</div>}
        {job.status === 'canceled' && <div className="activity__note">Canceled</div>}
      </div>
      {running && <Button variant="ghost" onClick={() => void api.cancelJob(job.id)}>Cancel</Button>}
      {job.status === 'done' && job.outputs[0] && (
        <Button variant="ghost" title={revealLabel()} onClick={() => void api.reveal(job.outputs[0])}>Show</Button>
      )}
    </li>
  );
}

function startOfToday(): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function ActivityList() {
  const [jobs, setJobs] = useState<JobUpdate[]>([]);

  useEffect(() => {
    let alive = true;
    void api.listJobs().then((list) => { if (alive) setJobs((cur) => (cur.length ? cur : list.slice(0, MAX_ROWS))); });
    const off = api.onJobUpdate((u) => {
      setJobs((cur) => (cur.some((j) => j.id === u.id) ? cur.map((j) => (j.id === u.id ? u : j)) : [u, ...cur].slice(0, MAX_ROWS)));
    });
    return () => { alive = false; off(); };
  }, []);

  if (jobs.length === 0) return null;
  const today = startOfToday();
  const groups = [
    { title: 'Today', rows: jobs.filter((j) => j.createdAt >= today) },
    { title: 'Earlier', rows: jobs.filter((j) => j.createdAt < today) }
  ].filter((g) => g.rows.length > 0);
  const hasFinished = jobs.some((j) => !isActive(j));
  return (
    <section className="activity" aria-label="Recent activity">
      <div className="activity__head">
        <h2 className="activity__heading">Recent</h2>
        {hasFinished && <Button variant="ghost" onClick={() => setJobs((cur) => cur.filter(isActive))}>Clear</Button>}
      </div>
      {groups.map((g) => (
        <div key={g.title}>
          {groups.length > 1 && <h3 className="activity__group">{g.title}</h3>}
          <ul className="activity__list">{g.rows.map((j) => <ActivityRow key={j.id} job={j} />)}</ul>
        </div>
      ))}
    </section>
  );
}
