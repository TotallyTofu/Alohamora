//! Replaces AbortSignal. Cloning shares the same flag.

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

use crate::{AppError, Result};

#[derive(Clone, Default, Debug)]
pub struct CancelToken(Arc<AtomicBool>);

impl CancelToken {
    pub fn new() -> Self {
        Self::default()
    }
    pub fn cancel(&self) {
        self.0.store(true, Ordering::SeqCst);
    }
    pub fn is_cancelled(&self) -> bool {
        self.0.load(Ordering::SeqCst)
    }
    /// `throwIfAborted`: returns Err(Canceled) once cancelled. Use with `?` inside loops.
    pub fn check(&self) -> Result<()> {
        if self.is_cancelled() { Err(AppError::Canceled) } else { Ok(()) }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn clones_share_the_flag() {
        let token = CancelToken::new();
        let copy = token.clone();
        assert!(token.check().is_ok());
        copy.cancel();
        assert!(token.is_cancelled());
        assert!(token.check().unwrap_err().is_canceled());
    }
}
