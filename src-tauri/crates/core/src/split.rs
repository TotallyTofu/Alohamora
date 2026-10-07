//! Port of src/shared/split.ts (video split points).

use crate::js::js_round;
use crate::options::{SplitMode, VideoSplitOptions};

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Segment {
    pub start: f64,
    pub end: f64,
}

pub fn split_segments(duration: f64, o: &VideoSplitOptions) -> Vec<Segment> {
    let cuts: Vec<f64> = match o.mode {
        SplitMode::Parts => {
            let n = js_round(o.parts).clamp(2.0, 100.0) as usize;
            (0..n - 1).map(|i| duration * (i as f64 + 1.0) / n as f64).collect()
        }
        SplitMode::Every => {
            let s = o.every_sec.max(1.0);
            let mut v = Vec::new();
            let mut t = s;
            while t < duration - 0.05 {
                v.push(t);
                t += s;
            }
            v
        }
        SplitMode::At => o.times.clone(),
    };
    let mut clean: Vec<f64> = cuts
        .into_iter()
        .filter(|t| *t > 0.05 && *t < duration - 0.05)
        .map(|t| js_round(t * 1000.0) / 1000.0)
        .collect();
    clean.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
    clean.dedup();
    let mut pts = vec![0.0];
    pts.extend(clean);
    pts.push(duration);
    pts.windows(2).map(|w| Segment { start: w[0], end: w[1] }).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn o(mode: SplitMode, times: Vec<f64>, parts: f64, every: f64) -> VideoSplitOptions {
        VideoSplitOptions { mode, times, parts, every_sec: every, precise: false }
    }

    #[test]
    fn segments() {
        let s = split_segments(10.0, &o(SplitMode::Parts, vec![], 2.0, 60.0));
        assert_eq!(s, vec![Segment { start: 0.0, end: 5.0 }, Segment { start: 5.0, end: 10.0 }]);
        let e = split_segments(10.0, &o(SplitMode::Every, vec![], 2.0, 4.0));
        assert_eq!(e.len(), 3);
        let a = split_segments(10.0, &o(SplitMode::At, vec![7.0, 3.0, 3.0, 0.01], 2.0, 60.0));
        assert_eq!(a.len(), 3);
        assert_eq!(a[1], Segment { start: 3.0, end: 7.0 });
        assert_eq!(split_segments(4.0, &o(SplitMode::At, vec![], 2.0, 60.0)).len(), 1);
    }
}
