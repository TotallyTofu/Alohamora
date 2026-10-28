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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn tails_count_characters_not_bytes() {
        assert_eq!(keep_tail("abcdef", 3), "def");
        assert_eq!(keep_tail("ab", 5), "ab");
        assert_eq!(keep_tail("xin chào thế giới", 5), " giới");
        assert_eq!(last_lines("a\nb\nc", 2), "b\nc");
        assert_eq!(last_lines("a\r\nb", 5), "a\nb");
        assert_eq!(last_lines("", 3), "");
    }

    #[test]
    fn a_missing_program_is_a_friendly_tool_error() {
        let err = run_process(Path::new("alohamora-no-such-program"), &[], None, "Thing").err().expect("must fail");
        assert!(matches!(&err, AppError::Tool { message, .. } if message == "Thing could not be started"), "{err:?}");
    }

    #[test]
    fn a_cancelled_job_does_not_start_the_program() {
        let cancel = CancelToken::new();
        cancel.cancel();
        let err = run_process(Path::new("alohamora-no-such-program"), &[], Some(&cancel), "Thing").err().expect("must fail");
        assert!(err.is_canceled());
    }

    // The test binary itself is a program that exists on every OS: `--list` succeeds, an unknown flag fails.
    #[test]
    fn output_and_exit_codes_are_collected() {
        let me = std::env::current_exe().expect("test binary");
        let ok = run_process(&me, &["--list".into()], None, "Tests").expect("--list runs");
        assert!(String::from_utf8_lossy(&ok.stdout).contains("a_missing_program_is_a_friendly_tool_error"));
        let err = run_process(&me, &["--alohamora-unknown-flag".into()], None, "Tests").err().expect("unknown flag fails");
        match err {
            AppError::Tool { message, details } => {
                assert!(message.starts_with("Tests failed (exit code "), "{message}");
                assert!(details.contains("alohamora-unknown-flag"), "{details}");
            }
            other => panic!("expected a tool error, got {other:?}"),
        }
    }
}
