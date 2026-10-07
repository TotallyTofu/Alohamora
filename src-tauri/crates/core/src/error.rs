//! Port of src/main/errors.ts. One error type for the whole backend.

use std::fmt;

/// Every fallible backend function returns `Result<T>`.
pub type Result<T> = std::result::Result<T, AppError>;

#[derive(Debug)]
pub enum AppError {
    /// Expected problem, shown to the user as-is (TypeScript `UserError`).
    User { message: String, details: Option<String> },
    /// An engine failed (FFmpeg, pdfium, Tesseract…). `message` is user-friendly, `details` is technical (`ToolError`).
    Tool { message: String, details: String },
    /// The job was cancelled (`CanceledError`).
    Canceled,
    /// File-system and other OS errors.
    Io(std::io::Error),
    /// Anything else (library errors). Shown as the generic message; the text goes into Details.
    Other(String),
}

impl AppError {
    pub fn user(message: impl Into<String>) -> Self {
        AppError::User { message: message.into(), details: None }
    }
    pub fn user_with(message: impl Into<String>, details: impl Into<String>) -> Self {
        AppError::User { message: message.into(), details: Some(details.into()) }
    }
    pub fn tool(message: impl Into<String>, details: impl Into<String>) -> Self {
        AppError::Tool { message: message.into(), details: details.into() }
    }
    pub fn other(text: impl fmt::Display) -> Self {
        AppError::Other(text.to_string())
    }
    pub fn is_canceled(&self) -> bool {
        matches!(self, AppError::Canceled)
    }
}

impl fmt::Display for AppError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            AppError::User { message, .. } => write!(f, "{message}"),
            AppError::Tool { message, .. } => write!(f, "{message}"),
            AppError::Canceled => write!(f, "Canceled"),
            AppError::Io(e) => write!(f, "{e}"),
            AppError::Other(s) => write!(f, "{s}"),
        }
    }
}

impl std::error::Error for AppError {}

impl From<std::io::Error> for AppError {
    fn from(e: std::io::Error) -> Self {
        AppError::Io(e)
    }
}

impl From<serde_json::Error> for AppError {
    fn from(e: serde_json::Error) -> Self {
        AppError::Other(format!("JSON: {e}"))
    }
}

/// What the UI shows: a title and optional technical details.
#[derive(Debug, Clone, PartialEq)]
pub struct UserMessage {
    pub message: String,
    pub details: Option<String>,
}

pub const MSG_CANT_ACCESS: &str = "Alohamora can't read or write this file. Close it in other apps and try again.";
pub const MSG_DISK_FULL: &str = "The disk is full.";
pub const MSG_GENERIC: &str = "Something went wrong while processing this file.";

/// Friendly text for operating-system error codes (locked, read-only or full disk).
fn friendly_os_error(e: &std::io::Error) -> Option<&'static str> {
    let code = e.raw_os_error()?;
    #[cfg(windows)]
    {
        // ACCESS_DENIED, WRITE_PROTECT, SHARING_VIOLATION, LOCK_VIOLATION / HANDLE_DISK_FULL, DISK_FULL
        match code {
            5 | 19 | 32 | 33 => Some(MSG_CANT_ACCESS),
            39 | 112 => Some(MSG_DISK_FULL),
            _ => None,
        }
    }
    #[cfg(not(windows))]
    {
        // EPERM, EACCES, EBUSY, EROFS / ENOSPC (same numbers on Linux and macOS)
        match code {
            1 | 13 | 16 | 30 => Some(MSG_CANT_ACCESS),
            28 => Some(MSG_DISK_FULL),
            _ => None,
        }
    }
}

/// Port of `toUserMessage`.
pub fn to_user_message(err: &AppError) -> UserMessage {
    match err {
        AppError::User { message, details } => UserMessage { message: message.clone(), details: details.clone() },
        AppError::Tool { message, details } => UserMessage { message: message.clone(), details: Some(details.clone()) },
        AppError::Canceled => UserMessage { message: "Canceled".to_string(), details: None },
        AppError::Io(e) => match friendly_os_error(e) {
            Some(m) => UserMessage { message: m.to_string(), details: Some(format!("{e:?}")) },
            None => UserMessage { message: MSG_GENERIC.to_string(), details: Some(format!("{e:?}")) },
        },
        AppError::Other(s) => UserMessage { message: MSG_GENERIC.to_string(), details: Some(s.clone()) },
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn user_and_tool_pass_through() {
        let m = to_user_message(&AppError::user("Nope"));
        assert_eq!(m.message, "Nope");
        let t = to_user_message(&AppError::tool("Tool broke", "stderr"));
        assert_eq!(t.message, "Tool broke");
        assert_eq!(t.details.as_deref(), Some("stderr"));
    }

    #[test]
    fn os_errors_are_friendly() {
        #[cfg(not(windows))]
        let (denied, full) = (13, 28);
        #[cfg(windows)]
        let (denied, full) = (5, 112);
        let m = to_user_message(&AppError::Io(std::io::Error::from_raw_os_error(denied)));
        assert_eq!(m.message, MSG_CANT_ACCESS);
        let f = to_user_message(&AppError::Io(std::io::Error::from_raw_os_error(full)));
        assert_eq!(f.message, MSG_DISK_FULL);
    }

    #[test]
    fn anything_else_is_generic() {
        let m = to_user_message(&AppError::other("boom"));
        assert_eq!(m.message, MSG_GENERIC);
        assert_eq!(m.details.as_deref(), Some("boom"));
    }
}
