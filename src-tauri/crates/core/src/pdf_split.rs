//! Port of src/shared/pdfSplit.ts.

use crate::js::js_round;
use crate::options::{PdfSplitMode, PdfSplitOptions};
use crate::page_ranges::{flatten_ranges, parse_page_ranges};

/// Page groups (0-based) for a split request. Errors are user-facing sentences.
pub fn split_groups(o: &PdfSplitOptions, total: usize) -> Result<Vec<Vec<usize>>, String> {
    match o.mode {
        PdfSplitMode::Each => Ok((0..total).map(|i| vec![i]).collect()),
        PdfSplitMode::Every => {
            let n = js_round(o.every).max(1.0) as usize;
            let mut groups = Vec::new();
            let mut i = 0;
            while i < total {
                groups.push((i..(i + n).min(total)).collect());
                i += n;
            }
            Ok(groups)
        }
        PdfSplitMode::Ranges | PdfSplitMode::Extract => {
            if o.ranges.trim().is_empty() {
                return Err("Enter the pages to use, for example 1-3, 5".to_string());
            }
            let parsed = parse_page_ranges(&o.ranges, total)?;
            if o.mode == PdfSplitMode::Ranges { Ok(parsed) } else { Ok(vec![flatten_ranges(&parsed)]) }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn opts(mode: PdfSplitMode, every: f64, ranges: &str) -> PdfSplitOptions {
        PdfSplitOptions { mode, every, ranges: ranges.to_string() }
    }

    #[test]
    fn groups() {
        assert_eq!(split_groups(&opts(PdfSplitMode::Each, 1.0, ""), 3).unwrap(), vec![vec![0], vec![1], vec![2]]);
        assert_eq!(split_groups(&opts(PdfSplitMode::Every, 2.0, ""), 5).unwrap(), vec![vec![0, 1], vec![2, 3], vec![4]]);
        assert_eq!(split_groups(&opts(PdfSplitMode::Every, 0.0, ""), 2).unwrap(), vec![vec![0], vec![1]]);
        assert_eq!(split_groups(&opts(PdfSplitMode::Ranges, 1.0, "1-2,3"), 3).unwrap(), vec![vec![0, 1], vec![2]]);
        assert_eq!(split_groups(&opts(PdfSplitMode::Extract, 1.0, "2, 1-2"), 3).unwrap(), vec![vec![1, 0]]);
        assert!(split_groups(&opts(PdfSplitMode::Ranges, 1.0, "9"), 3).unwrap_err().contains("doesn't exist"));
        assert!(split_groups(&opts(PdfSplitMode::Extract, 1.0, "  "), 3).unwrap_err().contains("Enter the pages"));
    }
}
