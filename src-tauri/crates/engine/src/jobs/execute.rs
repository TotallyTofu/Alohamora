//! Port of src/main/jobs/execute.ts.

use alohamora_core::registry::{label, tool_meta};
use alohamora_core::types::{Capabilities, JobRequest, Settings};

use super::context::{JobContext, ProgressFn};
use crate::cancel::CancelToken;
use crate::{convert, inspect, tools, AppError, Result};

pub fn job_label(req: &JobRequest) -> String {
    match req {
        JobRequest::Convert { target, .. } => format!("Convert to {}", label(*target)),
        JobRequest::Tool { tool_id, .. } => tool_meta(*tool_id).label.clone(),
    }
}

fn detail_for(name: &str, i: usize, n: usize) -> String {
    if n > 1 { format!("{name} · {} of {n}", i + 1) } else { name.to_string() }
}

pub fn execute_request(req: &JobRequest, ctx: &JobContext) -> Result<()> {
    let files = inspect::inspect_files(req.inputs(), true);
    if files.is_empty() {
        return Err(AppError::user("No files to process."));
    }
    match req {
        JobRequest::Convert { target, options, .. } => {
            let opts = options.clone().unwrap_or_default();
            let mut skipped = 0;
            for (i, f) in files.iter().enumerate() {
                ctx.check_cancel()?;
                ctx.set_subtask(i, files.len(), Some(detail_for(&f.name, i, files.len())));
                if f.fmt == Some(*target) {
                    skipped += 1;
                    continue;
                }
                if f.fmt.is_none() || f.category.is_none() {
                    return Err(AppError::user(format!("{} is not a supported file type.", f.name)));
                }
                convert::convert(f, *target, &opts, ctx)?;
            }
            if skipped > 0 {
                let what = if skipped > 1 { "files were" } else { "file was" };
                ctx.note(format!("{skipped} {what} already {}", label(*target)));
            }
            Ok(())
        }
        JobRequest::Tool { tool_id, options, .. } => {
            let meta = tool_meta(*tool_id);
            if files.len() < meta.min_inputs {
                return Err(AppError::user(format!("{} needs at least {} files.", meta.label, meta.min_inputs)));
            }
            if meta.per_file {
                for (i, f) in files.iter().enumerate() {
                    ctx.check_cancel()?;
                    ctx.set_subtask(i, files.len(), Some(detail_for(&f.name, i, files.len())));
                    tools::run(*tool_id, std::slice::from_ref(f), options, ctx)?;
                }
            } else {
                ctx.set_subtask(0, 1, Some(format!("{} files", files.len())));
                tools::run(*tool_id, &files, options, ctx)?;
            }
            Ok(())
        }
    }
}

pub struct RunJobOptions {
    pub id: Option<String>,
    pub cancel: CancelToken,
    pub settings: Settings,
    pub caps: Capabilities,
    pub on_progress: ProgressFn,
}

pub struct JobResult {
    pub outputs: Vec<String>,
    pub notes: Vec<String>,
}

/// Execute a request start-to-finish (used by the queue AND the self-test).
pub fn run_job_now(req: &JobRequest, o: RunJobOptions) -> Result<JobResult> {
    let id = o.id.unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
    let ctx = JobContext::new(&id, o.cancel, o.settings, o.caps, o.on_progress)?;
    let result = execute_request(req, &ctx).and_then(|_| ctx.finalize(req.inputs()));
    let notes = ctx.notes();
    ctx.cleanup();
    result.map(|outputs| JobResult { outputs, notes })
}
