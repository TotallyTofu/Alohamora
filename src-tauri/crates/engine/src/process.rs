//! Port of src/main/engines/process.ts: run a program with an argument list (never a shell).

use std::io::Read;
use std::path::Path;
use std::process::{Child, Command, Stdio};
use std::thread;
use std::time::Duration;

use crate::cancel::CancelToken;
use crate::{AppError, Result};

pub struct ProcessOutput {
    pub stdout: Vec<u8>,
    /// The last 20,000 characters of stderr.
    pub stderr: String,
}

/// A Command that never opens a console window on Windows.
pub fn command(exe: &Path) -> Command {
    let mut c = Command::new(exe);
    c.stdin(Stdio::null());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        c.creation_flags(CREATE_NO_WINDOW);
    }
    c
}

/// Keep only the last `max` characters of `s`.
pub fn keep_tail(s: &str, max: usize) -> String {
    let count = s.chars().count();
    if count <= max { s.to_string() } else { s.chars().skip(count - max).collect() }
}

/// Last `n` lines of `s`, joined with \n.
pub fn last_lines(s: &str, n: usize) -> String {
    let lines: Vec<&str> = s.lines().collect();
    lines[lines.len().saturating_sub(n)..].join("\n")
}

/// Wait for the child, killing it when `cancel` fires. Returns the exit status, or Err(Canceled).
pub fn wait_or_cancel(child: &mut Child, cancel: Option<&CancelToken>) -> Result<std::process::ExitStatus> {
    loop {
        if let Some(status) = child.try_wait()? {
            if cancel.is_some_and(|c| c.is_cancelled()) {
                return Err(AppError::Canceled);
            }
            return Ok(status);
        }
        if cancel.is_some_and(|c| c.is_cancelled()) {
            let _ = child.kill();
            let _ = child.wait();
            return Err(AppError::Canceled);
        }
        thread::sleep(Duration::from_millis(20));
    }
}

/// Run `exe args…`, collect stdout and the stderr tail. Non-zero exit → Tool error "<name> failed (exit code N)".
pub fn run_process(exe: &Path, args: &[String], cancel: Option<&CancelToken>, name: &str) -> Result<ProcessOutput> {
    if let Some(c) = cancel {
        c.check()?;
    }
    let mut child = command(exe)
        .args(args)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| AppError::tool(format!("{name} could not be started"), format!("{}: {e}", exe.display())))?;
    let mut out = child.stdout.take().expect("piped stdout");
    let mut err = child.stderr.take().expect("piped stderr");
    let out_thread = thread::spawn(move || {
        let mut buf = Vec::new();
        let _ = out.read_to_end(&mut buf);
        buf
    });
    let err_thread = thread::spawn(move || {
        let mut buf = Vec::new();
        let _ = err.read_to_end(&mut buf);
        keep_tail(&String::from_utf8_lossy(&buf), 20_000)
    });
    let status = wait_or_cancel(&mut child, cancel);
    let stdout = out_thread.join().unwrap_or_default();
    let stderr = err_thread.join().unwrap_or_default();
    let status = status?;
    if status.success() {
        return Ok(ProcessOutput { stdout, stderr });
    }
    let code = status.code().map(|c| c.to_string()).unwrap_or_else(|| "null".to_string());
    Err(AppError::tool(format!("{name} failed (exit code {code})"), last_lines(&stderr, 20)))
}
