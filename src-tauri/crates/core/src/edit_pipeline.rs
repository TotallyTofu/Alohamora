//! Port of src/shared/editPipeline.ts: turns the Edit panel's sliders into image operations.

use crate::js::js_round;
use crate::options::{EditEffect, EditParams};

pub type M3 = [[f64; 3]; 3];
const IDENTITY: M3 = [[1.0, 0.0, 0.0], [0.0, 1.0, 0.0], [0.0, 0.0, 1.0]];
const SEPIA: M3 = [[0.393, 0.769, 0.189], [0.349, 0.686, 0.168], [0.272, 0.534, 0.131]];

pub fn mul(a: &M3, b: &M3) -> M3 {
    let mut r = [[0.0; 3]; 3];
    for i in 0..3 {
        for j in 0..3 {
            r[i][j] = a[i][0] * b[0][j] + a[i][1] * b[1][j] + a[i][2] * b[2][j];
        }
    }
    r
}

fn mix(a: &M3, b: &M3, t: f64) -> M3 {
    let mut r = [[0.0; 3]; 3];
    for i in 0..3 {
        for j in 0..3 {
            r[i][j] = a[i][j] * t + b[i][j] * (1.0 - t);
        }
    }
    r
}

#[derive(Debug, Clone, PartialEq)]
pub struct EditSpec {
    /// out = a*in + b (per colour channel, 0..255 scale)
    pub linear: Option<(f64, f64)>,
    /// saturation multiplier and hue rotation in degrees
    pub modulate: Option<(f64, f64)>,
    pub recomb: Option<M3>,
    pub grayscale: bool,
    pub negate: bool,
    pub sharpen_sigma: Option<f64>,
    pub blur_sigma: Option<f64>,
    /// 0..1
    pub vignette: f64,
}

pub fn build_edit_spec(p: &EditParams) -> EditSpec {
    let m = 2f64.powf(p.exposure);
    let c = 1.0 + p.contrast / 100.0;
    let a = m * c;
    let b = 128.0 * (1.0 - c) + p.brightness * 1.28;
    let sat = 1.0 + p.saturation / 100.0;
    let mut recomb: Option<M3> = None;
    if p.warmth != 0.0 {
        let w = (p.warmth / 100.0) * 0.12;
        recomb = Some([[1.0 + w, 0.0, 0.0], [0.0, 1.0, 0.0], [0.0, 0.0, 1.0 - w]]);
    }
    if p.effect == EditEffect::Sepia || p.effect == EditEffect::Vintage {
        let s = if p.effect == EditEffect::Sepia { SEPIA } else { mix(&SEPIA, &IDENTITY, 0.5) };
        recomb = Some(mul(&s, &recomb.unwrap_or(IDENTITY)));
    }
    EditSpec {
        linear: if (a - 1.0).abs() > 1e-6 || b.abs() > 1e-6 { Some((a, b)) } else { None },
        modulate: if sat != 1.0 || p.hue != 0.0 { Some((sat, js_round(p.hue))) } else { None },
        recomb,
        grayscale: p.effect == EditEffect::Bw,
        negate: p.effect == EditEffect::Invert,
        sharpen_sigma: if p.detail > 0.0 { Some(0.5 + p.detail / 40.0) } else { None },
        blur_sigma: if p.blur > 0.0 { Some(0.3 + p.blur / 5.0) } else { None },
        vignette: ((p.vignette + if p.effect == EditEffect::Vintage { 35.0 } else { 0.0 }) / 100.0).min(1.0),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::options::default_edit;

    #[test]
    fn specs() {
        let d = default_edit();
        let none = build_edit_spec(&d);
        assert_eq!(none, EditSpec { linear: None, modulate: None, recomb: None, grayscale: false, negate: false, sharpen_sigma: None, blur_sigma: None, vignette: 0.0 });
        assert_eq!(build_edit_spec(&EditParams { exposure: 1.0, ..d.clone() }).linear, Some((2.0, 0.0)));
        assert_eq!(build_edit_spec(&EditParams { contrast: 50.0, ..d.clone() }).linear, Some((1.5, -64.0)));
        assert_eq!(build_edit_spec(&EditParams { saturation: -100.0, ..d.clone() }).modulate, Some((0.0, 0.0)));
        assert_eq!(build_edit_spec(&EditParams { hue: 90.4, ..d.clone() }).modulate, Some((1.0, 90.0)));
        assert!(build_edit_spec(&EditParams { effect: EditEffect::Bw, ..d.clone() }).grayscale);
        assert!((build_edit_spec(&EditParams { effect: EditEffect::Vintage, ..d.clone() }).vignette - 0.35).abs() < 1e-9);
        assert_eq!(build_edit_spec(&EditParams { vignette: 250.0, ..d.clone() }).vignette, 1.0);
        assert!((build_edit_spec(&EditParams { detail: 40.0, ..d.clone() }).sharpen_sigma.unwrap() - 1.5).abs() < 1e-9);
        assert!((build_edit_spec(&EditParams { blur: 50.0, ..d.clone() }).blur_sigma.unwrap() - 10.3).abs() < 1e-9);
        let w = build_edit_spec(&EditParams { warmth: 100.0, ..d }).recomb.unwrap();
        assert!(w[0][0] > 1.0 && w[2][2] < 1.0);
    }
}
