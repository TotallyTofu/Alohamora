//! Small OS-specific helpers: modifier keys during a drop, the pointer for the global drag wheel,
//! and showing the overlay without stealing focus. One file per OS; all expose the same functions.

/// Pointer state in PHYSICAL screen pixels.
#[derive(Debug, Clone, Copy, Default)]
pub struct Pointer {
    pub x: f64,
    pub y: f64,
    pub left_down: bool,
    pub shift: bool,
    pub alt: bool,
}

#[cfg(target_os = "linux")]
mod linux;
#[cfg(target_os = "macos")]
mod macos;
#[cfg(windows)]
mod windows;

#[cfg(target_os = "linux")]
pub use linux::*;
#[cfg(target_os = "macos")]
pub use macos::*;
#[cfg(windows)]
pub use windows::*;
