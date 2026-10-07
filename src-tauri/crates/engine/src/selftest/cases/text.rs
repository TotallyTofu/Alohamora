//! Port of src/main/selftest/cases/text.ts.

use alohamora_core::subtitles::parse_subtitles;
use alohamora_core::types::Fmt;

use super::{convert_case, Case};
use crate::selftest::assert::{check, expect_count, expect_text_includes, read_text, Check};

fn text_case(name: &str, fixture: &'static str, target: Fmt, verify: impl Fn(&str) -> Check + Send + Sync + 'static) -> Case {
    convert_case(name, "text", &[fixture], target, None, move |o| {
        expect_count(o, 1)?;
        verify(&o[0])
    })
}

pub fn cases() -> Vec<Case> {
    vec![
        text_case("convert.sub.srt-vtt", "subs.srt", Fmt::Vtt, |f| {
            let t = read_text(f);
            check(t.starts_with("WEBVTT"), "VTT must start with WEBVTT")?;
            check(t.contains("00:00:01.000 --> 00:00:02.500"), "VTT should use dot timestamps")
        }),
        text_case("convert.sub.srt-txt", "subs.srt", Fmt::Txt, |f| {
            let t = read_text(f);
            check(t.contains("Hello world"), "TXT should contain the cue text")?;
            check(!t.contains("<i>"), "TXT should not contain tags")
        }),
        text_case("convert.sub.vtt-srt", "subs.vtt", Fmt::Srt, |f| {
            check(read_text(f).contains("1\n00:00:01,000 --> 00:00:02,500"), "SRT should number cues and use comma timestamps")
        }),
        text_case("convert.text.txt-srt", "text.txt", Fmt::Srt, |f| {
            let n = parse_subtitles(&read_text(f)).len();
            check(n >= 4, format!("expected at least 4 cues, got {n}"))
        }),
        text_case("convert.text.txt-vtt", "text.txt", Fmt::Vtt, |f| expect_text_includes(f, "WEBVTT")),
        text_case("convert.text.txt-pdf", "text.txt", Fmt::Pdf, |f| {
            let n = crate::selftest::fixtures_docs::pdf_pages(f)?;
            check(n >= 1, "PDF should have at least one page")
        }),
        text_case("convert.text.txt-png", "text.txt", Fmt::Png, |f| crate::selftest::fixtures_docs::expect_image(f, "png", None)),
        text_case("convert.text.txt-jpg", "text.txt", Fmt::Jpg, |f| crate::selftest::fixtures_docs::expect_image(f, "jpeg", None)),
    ]
}
