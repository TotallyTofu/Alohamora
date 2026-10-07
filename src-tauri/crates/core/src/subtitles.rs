//! Port of src/shared/subtitles.ts.

use regex::Regex;

use crate::time::{format_srt_time, format_vtt_time, parse_timecode};

#[derive(Debug, Clone, PartialEq)]
pub struct Cue {
    pub start: f64,
    pub end: f64,
    pub text: String,
}

fn normalize(input: &str) -> String {
    input.trim_start_matches('\u{FEFF}').replace("\r\n", "\n").replace('\r', "\n")
}

/// Works for both SRT and VTT (headers, NOTE, STYLE and cue settings are skipped).
pub fn parse_subtitles(input: &str) -> Vec<Cue> {
    let time_line = Regex::new(r"^\s*((?:\d+:)?\d{1,2}:\d{2}[.,]\d{1,3})\s*-->\s*((?:\d+:)?\d{1,2}:\d{2}[.,]\d{1,3})")
        .expect("valid regex");
    let blank = Regex::new(r"\n{2,}").expect("valid regex");
    let mut cues = Vec::new();
    for block in blank.split(&normalize(input)) {
        let lines: Vec<&str> = block.split('\n').collect();
        let Some(idx) = lines.iter().position(|l| time_line.is_match(l)) else { continue };
        let Some(m) = time_line.captures(lines[idx]) else { continue };
        let (Some(start), Some(end)) = (parse_timecode(&m[1]), parse_timecode(&m[2])) else { continue };
        let text = lines[idx + 1..].join("\n").trim().to_string();
        if text.is_empty() {
            continue;
        }
        cues.push(Cue { start, end: end.max(start), text });
    }
    cues
}

/// keep_basic=true keeps <i> <b> <u> (valid in SRT).
pub fn strip_tags(text: &str, keep_basic: bool) -> String {
    let tag = Regex::new(r"(?i)</?([a-z0-9.]+)[^>]*>").expect("valid regex");
    let attrs = Regex::new(r"\s.*?>").expect("valid regex");
    let no_tags = tag.replace_all(text, |c: &regex::Captures| {
        let name = c[1].to_lowercase();
        if keep_basic && ["i", "b", "u"].contains(&name.as_str()) {
            attrs.replacen(&c[0], 1, ">").to_string()
        } else {
            String::new()
        }
    });
    if keep_basic {
        return no_tags.to_string();
    }
    let entity = Regex::new(r"&(amp|lt|gt|nbsp|quot);").expect("valid regex");
    entity
        .replace_all(&no_tags, |c: &regex::Captures| match &c[1] {
            "amp" => "&",
            "lt" => "<",
            "gt" => ">",
            "nbsp" => " ",
            _ => "\"",
        })
        .to_string()
}

pub fn to_srt(cues: &[Cue]) -> String {
    cues.iter()
        .enumerate()
        .map(|(i, c)| format!("{}\n{} --> {}\n{}\n", i + 1, format_srt_time(c.start), format_srt_time(c.end), strip_tags(&c.text, true)))
        .collect::<Vec<_>>()
        .join("\n")
}

pub fn to_vtt(cues: &[Cue]) -> String {
    let body = cues
        .iter()
        .map(|c| format!("{} --> {}\n{}\n", format_vtt_time(c.start), format_vtt_time(c.end), c.text))
        .collect::<Vec<_>>()
        .join("\n");
    format!("WEBVTT\n\n{body}")
}

pub fn to_plain_text(cues: &[Cue]) -> String {
    cues.iter().map(|c| strip_tags(&c.text, false)).collect::<Vec<_>>().join("\n") + "\n"
}

pub fn shift_cues(cues: &[Cue], offset_sec: f64) -> Vec<Cue> {
    cues.iter()
        .map(|c| Cue { start: (c.start + offset_sec).max(0.0), end: c.end + offset_sec, text: c.text.clone() })
        .filter(|c| c.end > 0.0)
        .collect()
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub enum CueTimingMode {
    Reading,
    Fixed,
}

pub struct TextToCuesOptions {
    pub timing: CueTimingMode,
    pub seconds_per_cue: f64,
}

/// Split at the space closest to the middle when longer than `max` (JS string lengths count UTF-16 units; we count chars).
fn wrap_two_lines(text: &str, max: usize) -> String {
    let chars: Vec<char> = text.chars().collect();
    if chars.len() <= max {
        return text.to_string();
    }
    let mid = chars.len() / 2;
    let mut best: Option<usize> = None;
    for (i, ch) in chars.iter().enumerate() {
        if *ch == ' ' {
            let better = match best {
                None => true,
                Some(b) => (i as i64 - mid as i64).abs() < (b as i64 - mid as i64).abs(),
            };
            if better {
                best = Some(i);
            }
        }
    }
    match best {
        None => text.to_string(),
        Some(b) => {
            let left: String = chars[..b].iter().collect();
            let right: String = chars[b + 1..].iter().collect();
            format!("{left}\n{right}")
        }
    }
}

fn chunk(line: &str, max_chunk: usize) -> Vec<String> {
    let mut out = Vec::new();
    let mut cur = String::new();
    for w in line.split_whitespace() {
        if !cur.is_empty() && cur.chars().count() + 1 + w.chars().count() > max_chunk {
            out.push(std::mem::take(&mut cur));
            cur = w.to_string();
        } else if cur.is_empty() {
            cur = w.to_string();
        } else {
            cur = format!("{cur} {w}");
        }
    }
    if !cur.is_empty() {
        out.push(cur);
    }
    out
}

/// One cue per non-empty line (long lines are split), timed by reading speed or a fixed duration.
pub fn text_to_cues(text: &str, o: &TextToCuesOptions) -> Vec<Cue> {
    let cps = 15.0;
    let max_line = 42;
    let gap = 0.1;
    let pieces: Vec<String> = normalize(text)
        .split('\n')
        .map(|l| l.trim())
        .filter(|l| !l.is_empty())
        .flat_map(|l| chunk(l, max_line * 2))
        .collect();
    let mut cues = Vec::new();
    let mut t = 0.0;
    for p in pieces {
        let dur = match o.timing {
            CueTimingMode::Fixed => o.seconds_per_cue,
            CueTimingMode::Reading => (p.chars().count() as f64 / cps).clamp(1.2, 7.0),
        };
        cues.push(Cue { start: t, end: t + dur, text: wrap_two_lines(&p, max_line) });
        t += dur + gap;
    }
    cues
}

#[cfg(test)]
mod tests {
    use super::*;

    const SRT: &str = "\u{FEFF}1\r\n00:00:01,000 --> 00:00:03,500\r\nHello <i>world</i>\r\n\r\n2\r\n00:00:04,000 --> 00:00:06,000\r\nSecond\r\nline\r\n";
    const VTT: &str = "WEBVTT\n\nNOTE this is a comment\nspanning two lines\n\n00:01.000 --> 00:02.500 align:start position:0%\nFirst cue without an id\n\nintro\n00:00:03.000 --> 00:00:04.000\nSecond cue\n";

    #[test]
    fn parses_srt_and_vtt() {
        let cues = parse_subtitles(SRT);
        assert_eq!(cues.len(), 2);
        assert_eq!(cues[0], Cue { start: 1.0, end: 3.5, text: "Hello <i>world</i>".into() });
        assert_eq!(cues[1].text, "Second\nline");
        let v = parse_subtitles(VTT);
        assert_eq!(v.len(), 2);
        assert_eq!(v[0], Cue { start: 1.0, end: 2.5, text: "First cue without an id".into() });
        assert_eq!(v[1], Cue { start: 3.0, end: 4.0, text: "Second cue".into() });
        assert_eq!(to_srt(&parse_subtitles(&to_vtt(&cues))), to_srt(&cues));
    }

    #[test]
    fn tags_and_writers() {
        assert_eq!(strip_tags("<v Bob><i>Hi</i> &amp; bye</v>", false), "Hi & bye");
        assert_eq!(strip_tags("<v Bob><i>Hi</i> &amp; bye</v>", true), "<i>Hi</i> &amp; bye");
        let cues = vec![Cue { start: 0.5, end: 2.0, text: "A <b>b</b> &amp; c".into() }];
        assert_eq!(to_srt(&cues), "1\n00:00:00,500 --> 00:00:02,000\nA <b>b</b> &amp; c\n");
        assert!(to_vtt(&cues).starts_with("WEBVTT\n\n00:00:00.500 --> 00:00:02.000\n"));
        assert_eq!(to_plain_text(&cues), "A b & c\n");
    }

    #[test]
    fn shifting() {
        let out = shift_cues(&[Cue { start: 1.0, end: 2.0, text: "a".into() }, Cue { start: 0.2, end: 0.8, text: "b".into() }], -0.5);
        assert_eq!(out.len(), 2);
        assert_eq!(out[0], Cue { start: 0.5, end: 1.5, text: "a".into() });
        assert_eq!(out[1].start, 0.0);
        assert!((out[1].end - 0.3).abs() < 1e-6);
        assert!(shift_cues(&[Cue { start: 0.0, end: 1.0, text: "gone".into() }], -5.0).is_empty());
    }

    #[test]
    fn cues_from_text() {
        let fixed = TextToCuesOptions { timing: CueTimingMode::Fixed, seconds_per_cue: 2.0 };
        let cues = text_to_cues("a\n\nb", &fixed);
        assert_eq!(cues.len(), 2);
        assert_eq!((cues[0].start, cues[0].end), (0.0, 2.0));
        assert!((cues[1].start - 2.1).abs() < 1e-6 && (cues[1].end - 4.1).abs() < 1e-6);
        let reading = TextToCuesOptions { timing: CueTimingMode::Reading, seconds_per_cue: 3.0 };
        let long = format!("Hi\n{}", "word ".repeat(80).trim());
        let rc = text_to_cues(&long, &reading);
        assert!(rc.len() > 2);
        for c in &rc {
            let d = c.end - c.start;
            assert!((1.2 - 1e-9..=7.0 + 1e-9).contains(&d));
        }
        let wrapped = text_to_cues("this is a rather long subtitle sentence that needs two lines", &fixed);
        assert_eq!(wrapped[0].text.split('\n').count(), 2);
    }
}
