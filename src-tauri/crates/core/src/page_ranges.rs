//! Port of src/shared/pageRanges.ts. Errors are the user-facing sentences (TypeScript RangeError messages).

/// Parse "1-3, 5, 8-" (1-based, inclusive) into groups of 0-based page indexes. "" → one group with all pages.
pub fn parse_page_ranges(input: &str, total: usize) -> Result<Vec<Vec<usize>>, String> {
    let text = input.trim();
    if text.is_empty() {
        return Ok(vec![(0..total).collect()]);
    }
    let range_re = regex::Regex::new(r"^(\d*)\s*-\s*(\d*)$").expect("valid regex");
    let num_re = regex::Regex::new(r"^\d+$").expect("valid regex");
    let mut groups = Vec::new();
    for raw in text.split(',') {
        let part = raw.trim();
        if part.is_empty() {
            continue;
        }
        let (from, to): (usize, usize) = if let Some(c) = range_re.captures(part) {
            let a = c.get(1).map(|m| m.as_str()).unwrap_or("");
            let b = c.get(2).map(|m| m.as_str()).unwrap_or("");
            let from = if a.is_empty() { 1 } else { a.parse().unwrap_or(usize::MAX) };
            let to = if b.is_empty() { total } else { b.parse().unwrap_or(usize::MAX) };
            (from, to)
        } else if num_re.is_match(part) {
            let n = part.parse().unwrap_or(usize::MAX);
            (n, n)
        } else {
            return Err(format!("\"{part}\" is not a page range. Use something like 1-3, 5, 8-"));
        };
        if from < 1 || to < 1 {
            return Err("Page numbers start at 1".to_string());
        }
        if from > total || to > total {
            return Err(format!("Page {} doesn't exist (this PDF has {} pages)", from.max(to), total));
        }
        if from > to {
            return Err(format!("\"{part}\" goes backwards"));
        }
        groups.push((from - 1..to).collect());
    }
    if groups.is_empty() {
        return Err("No pages selected".to_string());
    }
    Ok(groups)
}

/// Unique page indexes in first-seen order.
pub fn flatten_ranges(groups: &[Vec<usize>]) -> Vec<usize> {
    let mut seen = std::collections::HashSet::new();
    let mut out = Vec::new();
    for g in groups {
        for p in g {
            if seen.insert(*p) {
                out.push(*p);
            }
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses() {
        assert_eq!(parse_page_ranges("", 3).unwrap(), vec![vec![0, 1, 2]]);
        assert_eq!(parse_page_ranges("   ", 2).unwrap(), vec![vec![0, 1]]);
        assert_eq!(parse_page_ranges("1-2, 3", 3).unwrap(), vec![vec![0, 1], vec![2]]);
        assert_eq!(parse_page_ranges("2-", 4).unwrap(), vec![vec![1, 2, 3]]);
        assert_eq!(parse_page_ranges("-2", 4).unwrap(), vec![vec![0, 1]]);
    }

    #[test]
    fn friendly_errors() {
        assert!(parse_page_ranges("5", 3).unwrap_err().contains("doesn't exist"));
        assert!(parse_page_ranges("x", 3).unwrap_err().contains("not a page range"));
        assert!(parse_page_ranges("3-1", 5).unwrap_err().contains("backwards"));
        assert!(parse_page_ranges("0", 5).unwrap_err().contains("start at 1"));
        assert!(parse_page_ranges(",", 5).unwrap_err().contains("No pages"));
        assert_eq!(flatten_ranges(&[vec![0, 1], vec![1, 2], vec![0]]), vec![0, 1, 2]);
    }
}
