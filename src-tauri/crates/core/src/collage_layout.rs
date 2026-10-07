//! Port of src/shared/collageLayout.ts.

use crate::js::js_round;
use crate::options::CollageLayoutKind;

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Cell {
    pub x: f64,
    pub y: f64,
    pub w: f64,
    pub h: f64,
}

pub struct CollageLayout {
    pub width: u32,
    pub height: u32,
    pub cells: Vec<Cell>,
}

pub fn collage_cells(n: usize, layout: CollageLayoutKind, width: f64, gap: f64) -> CollageLayout {
    let w_total = js_round(width);
    let nf = n as f64;
    match layout {
        CollageLayoutKind::Row => {
            let cw = (w_total - gap * (nf + 1.0)) / nf;
            let cells = (0..n).map(|i| Cell { x: gap + i as f64 * (cw + gap), y: gap, w: cw, h: cw }).collect();
            CollageLayout { width: w_total as u32, height: js_round(cw + 2.0 * gap) as u32, cells }
        }
        CollageLayoutKind::Column => {
            let cw = w_total - 2.0 * gap;
            let ch = cw * 0.75;
            let cells = (0..n).map(|i| Cell { x: gap, y: gap + i as f64 * (ch + gap), w: cw, h: ch }).collect();
            CollageLayout { width: w_total as u32, height: js_round(nf * ch + (nf + 1.0) * gap) as u32, cells }
        }
        CollageLayoutKind::Featured if n >= 2 => {
            let big_w = (w_total - 3.0 * gap) * (2.0 / 3.0);
            let small_w = w_total - 3.0 * gap - big_w;
            let h_total = js_round(big_w * 0.75 + 2.0 * gap);
            let rest = (n - 1) as f64;
            let sh = (h_total - (rest + 1.0) * gap) / rest;
            let mut cells = vec![Cell { x: gap, y: gap, w: big_w, h: h_total - 2.0 * gap }];
            for i in 1..n {
                cells.push(Cell { x: 2.0 * gap + big_w, y: gap + (i as f64 - 1.0) * (sh + gap), w: small_w, h: sh });
            }
            CollageLayout { width: w_total as u32, height: h_total as u32, cells }
        }
        _ => {
            let cols = (nf.sqrt()).ceil();
            let rows = (nf / cols).ceil();
            let cw = (w_total - gap * (cols + 1.0)) / cols;
            let cols_u = cols as usize;
            let cells = (0..n)
                .map(|i| Cell { x: gap + (i % cols_u) as f64 * (cw + gap), y: gap + (i / cols_u) as f64 * (cw + gap), w: cw, h: cw })
                .collect();
            CollageLayout { width: w_total as u32, height: js_round(rows * cw + (rows + 1.0) * gap) as u32, cells }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn layouts() {
        let l = collage_cells(4, CollageLayoutKind::Grid, 1000.0, 0.0);
        assert_eq!((l.width, l.height), (1000, 1000));
        assert_eq!(l.cells[3], Cell { x: 500.0, y: 500.0, w: 500.0, h: 500.0 });
        let r = collage_cells(3, CollageLayoutKind::Row, 1000.0, 10.0);
        assert!(r.cells.iter().all(|c| c.y == 10.0));
        let f = collage_cells(3, CollageLayoutKind::Featured, 1200.0, 12.0);
        assert!((f.cells[0].w / f.cells[1].w - 2.0).abs() < 0.05);
        for layout in [CollageLayoutKind::Grid, CollageLayoutKind::Row, CollageLayoutKind::Column, CollageLayoutKind::Featured] {
            for n in [2, 3, 5, 7] {
                let l = collage_cells(n, layout, 1000.0, 12.0);
                for c in &l.cells {
                    assert!(c.x >= 0.0 && c.y >= 0.0);
                    assert!(c.x + c.w <= l.width as f64 + 1.0 && c.y + c.h <= l.height as f64 + 1.0);
                }
            }
        }
    }
}
