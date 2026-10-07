//! Port of src/shared/pdfReflow.ts: positioned PDF text → headings, paragraphs and list items.
//! Coordinates are in PDF points with y measured FROM THE TOP of the page (like pdf.js viewport coordinates).

use std::collections::{HashMap, HashSet};

use regex::Regex;

use crate::text::escape_xml;

#[derive(Debug, Clone, PartialEq)]
pub struct TextItem {
    pub str: String,
    pub x: f64,
    pub y: f64,
    pub w: f64,
    pub h: f64,
    pub font_size: f64,
    pub bold: bool,
    pub italic: bool,
}

#[derive(Debug, Clone, PartialEq)]
pub struct TextPage {
    pub width: f64,
    pub height: f64,
    pub items: Vec<TextItem>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct Run {
    pub text: String,
    pub bold: bool,
    pub italic: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum BlockKind {
    H1,
    H2,
    H3,
    P,
    Li,
}

impl BlockKind {
    fn tag(self) -> &'static str {
        match self {
            BlockKind::H1 => "h1",
            BlockKind::H2 => "h2",
            BlockKind::H3 => "h3",
            BlockKind::P => "p",
            BlockKind::Li => "li",
        }
    }
}

#[derive(Debug, Clone, PartialEq)]
pub enum Block {
    Text { kind: BlockKind, runs: Vec<Run> },
    PageBreak,
}

#[derive(Debug, Clone, PartialEq)]
pub struct Line {
    pub y: f64,
    pub x: f64,
    pub right: f64,
    pub font_size: f64,
    pub runs: Vec<Run>,
    pub text: String,
    pub bold: bool,
}

fn median(xs: &[f64]) -> f64 {
    if xs.is_empty() {
        return 0.0;
    }
    let mut s = xs.to_vec();
    s.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
    let m = s.len() / 2;
    if s.len() % 2 == 1 { s[m] } else { (s[m - 1] + s[m]) / 2.0 }
}

fn collapse_ws(s: &str) -> String {
    let re = Regex::new(r"\s+").expect("valid regex");
    re.replace_all(s, " ").to_string()
}

pub fn runs_text(runs: &[Run]) -> String {
    collapse_ws(&runs.iter().map(|r| r.text.as_str()).collect::<String>()).trim().to_string()
}

pub fn total_chars(pages: &[TextPage]) -> usize {
    pages.iter().map(|p| p.items.iter().map(|i| i.str.trim().chars().count()).sum::<usize>()).sum()
}

/// A PDF with almost no text per page is probably scanned images.
pub fn is_scanned(pages: &[TextPage]) -> bool {
    !pages.is_empty() && total_chars(pages) < 25 * pages.len()
}

pub fn group_lines(page: &TextPage) -> Vec<Line> {
    let mut items: Vec<&TextItem> = page.items.iter().filter(|i| !i.str.is_empty()).collect();
    items.sort_by(|a, b| a.y.partial_cmp(&b.y).unwrap_or(std::cmp::Ordering::Equal).then(a.x.partial_cmp(&b.x).unwrap_or(std::cmp::Ordering::Equal)));
    let mut rows: Vec<Vec<&TextItem>> = Vec::new();
    let mut row_y = f64::NEG_INFINITY;
    for it in items {
        let same_row = !rows.is_empty() && (it.y - row_y).abs() <= (it.font_size * 0.5).max(1.5);
        if same_row {
            rows.last_mut().expect("non-empty").push(it);
        } else {
            rows.push(vec![it]);
            row_y = it.y;
        }
    }
    let mut lines = Vec::new();
    for mut row in rows {
        row.sort_by(|a, b| a.x.partial_cmp(&b.x).unwrap_or(std::cmp::Ordering::Equal));
        let mut runs: Vec<Run> = Vec::new();
        let mut text = String::new();
        let mut prev_right: Option<f64> = None;
        for it in &row {
            let mut s = it.str.clone();
            if let Some(pr) = prev_right {
                if it.x - pr > it.font_size * 0.2 && !text.ends_with(' ') && !s.starts_with(' ') {
                    s = format!(" {s}");
                }
            }
            text.push_str(&s);
            prev_right = Some(it.x + it.w);
            match runs.last_mut() {
                Some(last) if last.bold == it.bold && last.italic == it.italic => last.text.push_str(&s),
                _ => runs.push(Run { text: s, bold: it.bold, italic: it.italic }),
            }
        }
        let sizes: Vec<f64> = row.iter().map(|i| i.font_size).collect();
        let line_text = collapse_ws(&text).trim().to_string();
        let bold = runs.iter().all(|r| r.bold || r.text.trim().is_empty());
        if !line_text.is_empty() {
            lines.push(Line {
                y: row[0].y,
                x: row[0].x,
                right: prev_right.unwrap_or(row[0].x),
                font_size: median(&sizes),
                runs,
                text: line_text,
                bold,
            });
        }
    }
    lines
}

const EDGE: f64 = 0.08;

/// Drop page numbers and lines repeated in the top/bottom 8% of most pages (headers/footers).
pub fn remove_repeated_edges(pages: Vec<Vec<Line>>, heights: &[f64]) -> Vec<Vec<Line>> {
    let page_no = Regex::new(r"(?i)^\s*(page\s*)?\d+(\s*(of|/)\s*\d+)?\s*$").expect("valid regex");
    let digits = Regex::new(r"\d+").expect("valid regex");
    let is_edge = |l: &Line, h: f64| l.y < h * EDGE || l.y > h * (1.0 - EDGE);
    let key = |l: &Line| digits.replace_all(&l.text, "#").to_lowercase();
    let mut counts: HashMap<String, usize> = HashMap::new();
    for (p, lines) in pages.iter().enumerate() {
        let mut seen = HashSet::new();
        for l in lines {
            if !is_edge(l, heights[p]) {
                continue;
            }
            let k = key(l);
            if seen.insert(k.clone()) {
                *counts.entry(k).or_insert(0) += 1;
            }
        }
    }
    let threshold = std::cmp::max(2, (pages.len() as f64 * 0.5).ceil() as usize);
    pages
        .into_iter()
        .enumerate()
        .map(|(p, lines)| {
            lines
                .into_iter()
                .filter(|l| {
                    if !is_edge(l, heights[p]) {
                        return true;
                    }
                    if page_no.is_match(&l.text) {
                        return false;
                    }
                    counts.get(&key(l)).copied().unwrap_or(0) < threshold
                })
                .collect()
        })
        .collect()
}

fn body_size(lines: &[&Line]) -> f64 {
    // keep insertion order so ties resolve like the JavaScript Map iteration
    let mut order: Vec<i64> = Vec::new();
    let mut weight: HashMap<i64, usize> = HashMap::new();
    for l in lines {
        let s = crate::js::js_round(l.font_size * 2.0) as i64; // half-point buckets
        if !weight.contains_key(&s) {
            order.push(s);
        }
        *weight.entry(s).or_insert(0) += l.text.chars().count();
    }
    let mut best = 24; // 12 pt in half points
    let mut best_w: i64 = -1;
    for s in order {
        let w = weight[&s] as i64;
        if w > best_w {
            best = s;
            best_w = w;
        }
    }
    best as f64 / 2.0
}

pub fn merge_runs(runs: &[Run]) -> Vec<Run> {
    let mut out: Vec<Run> = Vec::new();
    for r in runs {
        match out.last_mut() {
            Some(last) if last.bold == r.bold && last.italic == r.italic => last.text.push_str(&r.text),
            _ => out.push(r.clone()),
        }
    }
    out.into_iter()
        .map(|r| Run { text: collapse_ws(&r.text), ..r })
        .filter(|r| !r.text.is_empty())
        .collect()
}

struct Current {
    kind: BlockKind,
    runs: Vec<Run>,
    last: Line,
}

/// Turn positioned text into headings / paragraphs / list items.
pub fn reflow_pages(pages: &[TextPage], page_breaks: bool) -> Vec<Block> {
    let bullet = Regex::new(r"(?i)^(?:[•◦▪‣∙●○■□–-]|\*|\d{1,3}[.)]|[a-z][.)])\s+").expect("valid regex");
    let ends_sentence = Regex::new(r#"[.!?:]["”')]?$"#).expect("valid regex");
    let heading_punct = Regex::new(r"[.,;:]$").expect("valid regex");
    let hyphen_end = Regex::new(r"\p{L}-$").expect("valid regex");
    let lower_start = Regex::new(r"^\p{Ll}").expect("valid regex");

    let grouped: Vec<Vec<Line>> = pages.iter().map(group_lines).collect();
    let heights: Vec<f64> = pages.iter().map(|p| p.height).collect();
    let cleaned = remove_repeated_edges(grouped, &heights);
    let all: Vec<&Line> = cleaned.iter().flatten().collect();
    if all.is_empty() {
        return Vec::new();
    }
    let body = body_size(&all);
    let mut blocks: Vec<Block> = Vec::new();
    let mut cur: Option<Current> = None;

    fn flush(cur: &mut Option<Current>, blocks: &mut Vec<Block>) {
        if let Some(c) = cur.take() {
            blocks.push(Block::Text { kind: c.kind, runs: merge_runs(&c.runs) });
        }
    }

    for (pi, lines) in cleaned.iter().enumerate() {
        if page_breaks && pi > 0 {
            flush(&mut cur, &mut blocks);
            blocks.push(Block::PageBreak);
        }
        let mut gaps = Vec::new();
        for i in 1..lines.len() {
            let g = lines[i].y - lines[i - 1].y;
            if g > 0.0 {
                gaps.push(g);
            }
        }
        let m = median(&gaps);
        let normal_gap = if m != 0.0 { m } else { body * 1.3 };
        let page_right = lines.iter().map(|l| l.right).fold(0.0_f64, f64::max);

        for (li, line) in lines.iter().enumerate() {
            let ratio = line.font_size / body;
            let short = line.text.chars().count() < 160;
            let level = if !short {
                None
            } else if ratio >= 1.8 {
                Some(BlockKind::H1)
            } else if ratio >= 1.4 {
                Some(BlockKind::H2)
            } else if ratio >= 1.15 || (line.bold && line.text.chars().count() < 90 && !heading_punct.is_match(&line.text)) {
                Some(BlockKind::H3)
            } else {
                None
            };
            if let Some(level) = level {
                flush(&mut cur, &mut blocks);
                let continues = li > 0
                    && matches!(blocks.last(), Some(Block::Text { kind, .. }) if *kind == level)
                    && line.y - lines[li - 1].y <= normal_gap * 1.6;
                if continues {
                    if let Some(Block::Text { runs, .. }) = blocks.last_mut() {
                        runs.push(Run { text: " ".into(), bold: false, italic: false });
                        runs.extend(line.runs.iter().cloned());
                    }
                } else {
                    blocks.push(Block::Text { kind: level, runs: line.runs.clone() });
                }
                continue;
            }
            let is_bullet = bullet.is_match(&line.text);
            let prev = if li > 0 { Some(&lines[li - 1]) } else { None };
            let big_gap = match (prev, &cur) {
                (Some(p), _) => line.y - p.y > normal_gap * 1.45,
                (None, Some(c)) => ends_sentence.is_match(&c.last.text),
                (None, None) => true,
            };
            let prev_ended = match &cur {
                Some(c) => ends_sentence.is_match(&c.last.text) && c.last.right < page_right * 0.85,
                None => false,
            };
            if cur.is_none() || big_gap || is_bullet || prev_ended {
                flush(&mut cur, &mut blocks);
                let runs: Vec<Run> = if is_bullet {
                    line.runs
                        .iter()
                        .enumerate()
                        .map(|(i, r)| {
                            if i == 0 {
                                Run { text: bullet.replace(r.text.trim_start(), "").to_string(), ..r.clone() }
                            } else {
                                r.clone()
                            }
                        })
                        .collect()
                } else {
                    line.runs.clone()
                };
                cur = Some(Current { kind: if is_bullet { BlockKind::Li } else { BlockKind::P }, runs, last: line.clone() });
            } else if let Some(c) = cur.as_mut() {
                let joined_hyphen = match c.runs.last_mut() {
                    Some(last) if hyphen_end.is_match(&last.text) && lower_start.is_match(&line.text) => {
                        last.text.pop();
                        true
                    }
                    _ => false,
                };
                if !joined_hyphen {
                    c.runs.push(Run { text: " ".into(), bold: false, italic: false });
                }
                c.runs.extend(line.runs.iter().cloned());
                c.last = line.clone();
            }
        }
    }
    flush(&mut cur, &mut blocks);
    blocks
}

pub fn blocks_to_text(blocks: &[Block]) -> String {
    let mut parts = Vec::new();
    for b in blocks {
        if let Block::Text { kind, runs } = b {
            let t = runs_text(runs);
            parts.push(if *kind == BlockKind::Li { format!("• {t}") } else { t });
        }
    }
    parts.join("\n\n") + "\n"
}

/// Plain text (e.g. OCR output) → paragraph blocks.
pub fn text_to_blocks(text: &str) -> Vec<Block> {
    let para = Regex::new(r"\n\s*\n").expect("valid regex");
    let inner = Regex::new(r"\s*\n\s*").expect("valid regex");
    para.split(text)
        .map(|p| inner.replace_all(p, " ").trim().to_string())
        .filter(|p| !p.is_empty())
        .map(|t| Block::Text { kind: BlockKind::P, runs: vec![Run { text: t, bold: false, italic: false }] })
        .collect()
}

pub fn blocks_to_xhtml(blocks: &[Block]) -> String {
    let mut out: Vec<String> = Vec::new();
    let mut in_list = false;
    for b in blocks {
        let Block::Text { kind, runs } = b else { continue };
        if *kind == BlockKind::Li && !in_list {
            out.push("<ul>".into());
            in_list = true;
        }
        if *kind != BlockKind::Li && in_list {
            out.push("</ul>".into());
            in_list = false;
        }
        let inner: String = runs
            .iter()
            .map(|r| {
                let mut t = escape_xml(&r.text);
                if r.italic {
                    t = format!("<em>{t}</em>");
                }
                if r.bold {
                    t = format!("<strong>{t}</strong>");
                }
                t
            })
            .collect();
        out.push(format!("<{0}>{1}</{0}>", kind.tag(), inner));
    }
    if in_list {
        out.push("</ul>".into());
    }
    out.join("\n")
}

pub struct Chapter {
    pub title: String,
    pub blocks: Vec<Block>,
}

/// New chapter at every h1; very long chapters are cut every 300 blocks.
pub fn split_chapters(blocks: &[Block], fallback_title: &str) -> Vec<Chapter> {
    let mut chapters: Vec<Chapter> = Vec::new();
    for b in blocks {
        let is_h1 = matches!(b, Block::Text { kind: BlockKind::H1, .. });
        let need_new = match chapters.last() {
            None => true,
            Some(c) => is_h1 || c.blocks.len() >= 300,
        };
        if need_new {
            let title = match (b, chapters.last()) {
                (Block::Text { kind: BlockKind::H1, runs }, _) => runs_text(runs),
                (_, Some(c)) => format!("{} (cont.)", c.title),
                (_, None) => fallback_title.to_string(),
            };
            chapters.push(Chapter { title, blocks: Vec::new() });
        }
        chapters.last_mut().expect("just pushed").blocks.push(b.clone());
    }
    chapters
}

#[cfg(test)]
mod tests {
    use super::*;

    fn item(s: &str, x: f64, y: f64, size: f64, bold: bool) -> TextItem {
        TextItem { str: s.into(), x, y, w: s.len() as f64 * size * 0.5, h: size, font_size: size, bold, italic: false }
    }

    #[test]
    fn headings_paragraphs_lists_and_page_numbers() {
        let page = |n: usize| TextPage {
            width: 612.0,
            height: 792.0,
            items: vec![
                item("Big Title", 72.0, 90.0, 24.0, true),
                item("This is a paragraph line that wraps", 72.0, 130.0, 12.0, false),
                item("onto the next line here.", 72.0, 145.0, 12.0, false),
                item("• First item", 72.0, 180.0, 12.0, false),
                item("• Second item", 72.0, 195.0, 12.0, false),
                item(&n.to_string(), 300.0, 770.0, 10.0, false),
            ],
        };
        let blocks = reflow_pages(&[page(1), page(2), page(3)], false);
        let text = blocks_to_text(&blocks);
        assert!(text.contains("Big Title"));
        assert!(text.contains("This is a paragraph line that wraps onto the next line here."));
        assert!(text.contains("• First item"));
        assert!(!text.lines().any(|l| l.trim() == "2"), "page numbers are removed");
        assert!(matches!(&blocks[0], Block::Text { kind: BlockKind::H1, .. }));
        let xhtml = blocks_to_xhtml(&blocks);
        assert!(xhtml.contains("<ul>") && xhtml.contains("<li>First item</li>"));
        assert!(split_chapters(&blocks, "Doc").len() >= 3);
    }

    #[test]
    fn scanned_detection_and_ocr_blocks() {
        assert!(is_scanned(&[TextPage { width: 1.0, height: 1.0, items: vec![] }]));
        let b = text_to_blocks("a\nb\n\nc");
        assert_eq!(b.len(), 2);
        assert_eq!(blocks_to_text(&b), "a b\n\nc\n");
    }

    #[test]
    fn hyphenated_words_join() {
        let p = TextPage {
            width: 612.0,
            height: 792.0,
            items: vec![item("A long sentence with a hyph-", 72.0, 300.0, 12.0, false), item("enated word in it.", 72.0, 315.0, 12.0, false)],
        };
        assert!(blocks_to_text(&reflow_pages(&[p], false)).contains("hyphenated word"));
    }
}
