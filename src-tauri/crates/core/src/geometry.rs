//! Port of the parts of src/shared/geometry.ts that the backend needs.
//! (dragRect and the aspect list stay in TypeScript: only the UI uses them.)

use serde::{Deserialize, Serialize};

use crate::js::js_round;

/// 0..1, relative to the DISPLAYED frame (after EXIF / video rotation).
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct NormRect {
    pub x: f64,
    pub y: f64,
    pub w: f64,
    pub h: f64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct PixelRect {
    pub x: u32,
    pub y: u32,
    pub w: u32,
    pub h: u32,
}

pub const MIN_NORM: f64 = 0.02;
pub const FULL_RECT: NormRect = NormRect { x: 0.0, y: 0.0, w: 1.0, h: 1.0 };

pub fn clamp_norm_rect(r: NormRect) -> NormRect {
    let w = r.w.clamp(MIN_NORM, 1.0);
    let h = r.h.clamp(MIN_NORM, 1.0);
    let x = r.x.clamp(0.0, 1.0 - w);
    let y = r.y.clamp(0.0, 1.0 - h);
    NormRect { x, y, w, h }
}

/// Normalized → integer pixels inside the frame. `even` rounds down to even numbers (required by H.264).
pub fn to_pixel_rect(r: NormRect, width: u32, height: u32, even: bool) -> PixelRect {
    let (wf, hf) = (width as f64, height as f64);
    let mut x = js_round(r.x * wf) as i64;
    let mut y = js_round(r.y * hf) as i64;
    let mut w = js_round(r.w * wf) as i64;
    let mut h = js_round(r.h * hf) as i64;
    w = w.min(width as i64 - x).max(2);
    h = h.min(height as i64 - y).max(2);
    if even {
        x -= x % 2;
        y -= y % 2;
        w -= w % 2;
        h -= h % 2;
    }
    PixelRect { x: x.max(0) as u32, y: y.max(0) as u32, w: w.max(0) as u32, h: h.max(0) as u32 }
}

pub fn is_full_rect(r: NormRect) -> bool {
    r.x <= 0.001 && r.y <= 0.001 && r.w >= 0.999 && r.h >= 0.999
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pixel_rects() {
        let p = to_pixel_rect(NormRect { x: 0.1, y: 0.1, w: 0.5, h: 0.5 }, 1001, 501, true);
        for v in [p.x, p.y, p.w, p.h] {
            assert_eq!(v % 2, 0);
        }
        assert!(p.x + p.w <= 1001 && p.y + p.h <= 501);
        let small = to_pixel_rect(NormRect { x: 0.999, y: 0.999, w: 0.0001, h: 0.0001 }, 100, 100, false);
        assert!(small.w >= 2 && small.h >= 2);
        let c = to_pixel_rect(NormRect { x: 0.25, y: 0.25, w: 0.5, h: 0.5 }, 640, 360, true);
        assert_eq!((c.x, c.y, c.w, c.h), (160, 90, 320, 180));
    }

    #[test]
    fn clamp_and_full() {
        let r = clamp_norm_rect(NormRect { x: -1.0, y: 2.0, w: 5.0, h: 0.0 });
        assert_eq!(r.w, 1.0);
        assert!((r.h - 0.02).abs() < 1e-9);
        assert_eq!(r.x, 0.0);
        assert!(is_full_rect(FULL_RECT));
        assert!(!is_full_rect(NormRect { x: 0.1, y: 0.0, w: 0.9, h: 1.0 }));
    }
}
