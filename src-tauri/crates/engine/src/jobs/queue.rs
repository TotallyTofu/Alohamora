//! Port of src/main/jobs/queue.ts: FIFO queue, N jobs at a time (Settings.maxConcurrentJobs), one thread per running job.

use std::sync::{Arc, Mutex, OnceLock};
use std::time::Instant;

use alohamora_core::error::to_user_message;
use alohamora_core::types::{JobRequest, JobStatus, JobUpdate};
use alohamora_core::util::now_ms;

use super::execute::{job_label, run_job_now, RunJobOptions};
use crate::cancel::CancelToken;
use crate::{capabilities, settings, AppError};

pub type EmitFn = Arc<dyn Fn(&JobUpdate) + Send + Sync>;

struct Rec {
    update: JobUpdate,
    cancel: CancelToken,
    last_emit: Option<Instant>,
}

pub struct JobQueue {
    jobs: Mutex<Vec<Rec>>,
    emit: EmitFn,
    on_finished: EmitFn,
}

static QUEUE: OnceLock<Arc<JobQueue>> = OnceLock::new();

/// Create the queue once at start-up. `emit` sends updates to the UI, `on_finished` shows notifications.
pub fn init(emit: EmitFn, on_finished: EmitFn) -> Arc<JobQueue> {
    QUEUE.get_or_init(|| Arc::new(JobQueue { jobs: Mutex::new(Vec::new()), emit, on_finished })).clone()
}

pub fn get() -> Arc<JobQueue> {
    QUEUE.get().expect("jobs::queue::init must be called at start-up").clone()
}

impl JobQueue {
    pub fn enqueue(self: &Arc<Self>, request: JobRequest) -> String {
        let id = uuid::Uuid::new_v4().to_string();
        let update = JobUpdate {
            id: id.clone(),
            label: job_label(&request),
            request,
            status: JobStatus::Queued,
            progress: 0.0,
            detail: None,
            outputs: vec![],
            note: None,
            output_bytes: None,
            error: None,
            error_details: None,
            created_at: now_ms(),
            finished_at: None,
        };
        (self.emit)(&update);
        self.jobs.lock().expect("queue").push(Rec { update, cancel: CancelToken::new(), last_emit: None });
        self.trim();
        self.pump();
        id
    }

    pub fn cancel(self: &Arc<Self>, id: &str) {
        let queued = {
            let jobs = self.jobs.lock().expect("queue");
            match jobs.iter().find(|r| r.update.id == id) {
                Some(r) if r.update.status == JobStatus::Queued => true,
                Some(r) if r.update.status == JobStatus::Running => {
                    r.cancel.cancel();
                    false
                }
                _ => false,
            }
        };
        if queued {
            self.finish(id, |u| u.status = JobStatus::Canceled);
        }
    }

    /// Newest first.
    pub fn list(&self) -> Vec<JobUpdate> {
        let mut v: Vec<JobUpdate> = self.jobs.lock().expect("queue").iter().map(|r| r.update.clone()).collect();
        v.sort_by_key(|u| std::cmp::Reverse(u.created_at));
        v
    }

    fn pump(self: &Arc<Self>) {
        let limit = (settings::get().max_concurrent_jobs as usize).max(1);
        loop {
            let next = {
                let mut jobs = self.jobs.lock().expect("queue");
                let running = jobs.iter().filter(|r| r.update.status == JobStatus::Running).count();
                if running >= limit {
                    return;
                }
                let Some(rec) = jobs.iter_mut().filter(|r| r.update.status == JobStatus::Queued).min_by_key(|r| r.update.created_at) else { return };
                rec.update.status = JobStatus::Running;
                rec.update.progress = 0.0;
                rec.last_emit = Some(Instant::now());
                (rec.update.clone(), rec.cancel.clone())
            };
            (self.emit)(&next.0);
            let me = self.clone();
            std::thread::spawn(move || me.run(next.0, next.1));
        }
    }

    fn run(self: Arc<Self>, update: JobUpdate, cancel: CancelToken) {
        let id = update.id.clone();
        let me = self.clone();
        let progress_id = id.clone();
        let result = run_job_now(
            &update.request,
            RunJobOptions {
                id: Some(id.clone()),
                cancel: cancel.clone(),
                settings: settings::get(),
                caps: capabilities::get(),
                on_progress: Box::new(move |p, detail| me.progress(&progress_id, p, detail)),
            },
        );
        match result {
            Ok(res) => {
                let bytes: u64 = res.outputs.iter().map(|o| std::fs::metadata(o).map(|m| m.len()).unwrap_or(0)).sum();
                let note = if res.notes.is_empty() { None } else { Some(res.notes.join(" · ")) };
                self.finish(&id, |u| {
                    u.status = JobStatus::Done;
                    u.progress = 1.0;
                    u.outputs = res.outputs.clone();
                    u.note = note.clone();
                    u.output_bytes = Some(bytes);
                });
            }
            Err(e) if matches!(e, AppError::Canceled) || cancel.is_cancelled() => self.finish(&id, |u| u.status = JobStatus::Canceled),
            Err(e) => {
                let m = to_user_message(&e);
                log::error!("Job failed: {} {e:?}", update.label);
                self.finish(&id, |u| {
                    u.status = JobStatus::Error;
                    u.error = Some(m.message.clone());
                    u.error_details = m.details.clone();
                });
            }
        }
        self.pump();
    }

    /// Progress updates are sent at most every 100 ms.
    fn progress(&self, id: &str, p: f64, detail: Option<String>) {
        let send = {
            let mut jobs = self.jobs.lock().expect("queue");
            let Some(r) = jobs.iter_mut().find(|r| r.update.id == id) else { return };
            r.update.progress = p;
            if detail.is_some() {
                r.update.detail = detail;
            }
            let due = r.last_emit.map(|t| t.elapsed().as_millis() > 100).unwrap_or(true);
            if due {
                r.last_emit = Some(Instant::now());
                Some(r.update.clone())
            } else {
                None
            }
        };
        if let Some(u) = send {
            (self.emit)(&u);
        }
    }

    fn finish(&self, id: &str, change: impl Fn(&mut JobUpdate)) {
        let u = {
            let mut jobs = self.jobs.lock().expect("queue");
            let Some(r) = jobs.iter_mut().find(|r| r.update.id == id) else { return };
            change(&mut r.update);
            r.update.finished_at = Some(now_ms());
            r.update.clone()
        };
        (self.emit)(&u);
        (self.on_finished)(&u);
    }

    /// Keep at most 50 finished jobs.
    fn trim(&self) {
        let mut jobs = self.jobs.lock().expect("queue");
        let mut finished: Vec<(u64, String)> = jobs
            .iter()
            .filter(|r| !matches!(r.update.status, JobStatus::Queued | JobStatus::Running))
            .map(|r| (r.update.created_at, r.update.id.clone()))
            .collect();
        finished.sort_by_key(|f| std::cmp::Reverse(f.0));
        let drop: std::collections::HashSet<String> = finished.into_iter().skip(50).map(|(_, id)| id).collect();
        jobs.retain(|r| !drop.contains(&r.update.id));
    }
}
