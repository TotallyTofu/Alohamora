//! Runs the golden cases in src/shared/golden/*.json against the Rust ports. src/shared/golden.test.ts runs the same cases
//! against the TypeScript originals, so the UI's previews (split points, page ranges, file names…) and what the backend
//! really does cannot drift apart. Results are converted to the TypeScript shapes before comparing.

use alohamora_core::collage_layout::collage_cells;
use alohamora_core::edit_pipeline::build_edit_spec;
use alohamora_core::geometry::{clamp_norm_rect, is_full_rect, to_pixel_rect, NormRect};
use alohamora_core::naming::{group_file_name, group_folder_name, output_file_name, sanitize_file_name, split_name, with_counter};
use alohamora_core::options::{with_defaults, CollageLayoutKind, EditParams, PdfSplitOptions, VideoSplitOptions};
use alohamora_core::page_ranges::{flatten_ranges, parse_page_ranges};
use alohamora_core::pdf_reflow::{
    blocks_to_text, blocks_to_xhtml, is_scanned, reflow_pages, split_chapters, text_to_blocks, Block, BlockKind, Run, TextItem, TextPage,
};
use alohamora_core::pdf_split::split_groups;
use alohamora_core::split::split_segments;
use alohamora_core::subtitles::{parse_subtitles, shift_cues, strip_tags, text_to_cues, to_plain_text, to_srt, to_vtt, CueTimingMode, Cue, TextToCuesOptions};
use alohamora_core::text::{decode_text, escape_xml, guess_lang};
use alohamora_core::time::{format_bytes, format_duration, format_srt_time, format_timecode, format_vtt_time, parse_timecode};
use alohamora_core::types::ToolId;
use serde::de::DeserializeOwned;
use serde_json::{json, Value};

const FILES: &[(&str, &str)] = &[
    ("collageLayout.json", include_str!("../../../../src/shared/golden/collageLayout.json")),
    ("editPipeline.json", include_str!("../../../../src/shared/golden/editPipeline.json")),
    ("geometry.json", include_str!("../../../../src/shared/golden/geometry.json")),
    ("naming.json", include_str!("../../../../src/shared/golden/naming.json")),
    ("pageRanges.json", include_str!("../../../../src/shared/golden/pageRanges.json")),
    ("pdfReflow.json", include_str!("../../../../src/shared/golden/pdfReflow.json")),
    ("split.json", include_str!("../../../../src/shared/golden/split.json")),
    ("subtitles.json", include_str!("../../../../src/shared/golden/subtitles.json")),
    ("text.json", include_str!("../../../../src/shared/golden/text.json")),
    ("time.json", include_str!("../../../../src/shared/golden/time.json")),
];

// ---------- argument helpers ----------

fn s(v: &Value) -> &str {
    v.as_str().expect("string argument")
}
fn f(v: &Value) -> f64 {
    v.as_f64().expect("number argument")
}
fn u(v: &Value) -> usize {
    v.as_u64().expect("unsigned argument") as usize
}
fn b(v: &Value) -> bool {
    v.as_bool().expect("bool argument")
}
fn de<T: DeserializeOwned>(v: &Value) -> T {
    serde_json::from_value(v.clone()).expect("argument matches the Rust type")
}

fn cues_from(v: &Value) -> Vec<Cue> {
    v.as_array()
        .expect("cue array")
        .iter()
        .map(|c| Cue { start: f(&c["start"]), end: f(&c["end"]), text: s(&c["text"]).to_string() })
        .collect()
}
fn cues_to(cues: &[Cue]) -> Value {
    cues.iter().map(|c| json!({ "start": c.start, "end": c.end, "text": c.text })).collect()
}

fn pages_from(v: &Value) -> Vec<TextPage> {
    let item = |i: &Value| TextItem {
        str: s(&i["str"]).to_string(),
        x: f(&i["x"]),
        y: f(&i["y"]),
        w: f(&i["w"]),
        h: f(&i["h"]),
        font_size: f(&i["fontSize"]),
        bold: b(&i["bold"]),
        italic: b(&i["italic"]),
    };
    let page = |p: &Value| TextPage { width: f(&p["width"]), height: f(&p["height"]), items: p["items"].as_array().expect("items").iter().map(item).collect() };
    v.as_array().expect("page array").iter().map(page).collect()
}

fn kind_from(t: &str) -> BlockKind {
    match t {
        "h1" => BlockKind::H1,
        "h2" => BlockKind::H2,
        "h3" => BlockKind::H3,
        "li" => BlockKind::Li,
        "p" => BlockKind::P,
        other => panic!("unknown block type {other}"),
    }
}
fn kind_to(k: BlockKind) -> &'static str {
    match k {
        BlockKind::H1 => "h1",
        BlockKind::H2 => "h2",
        BlockKind::H3 => "h3",
        BlockKind::Li => "li",
        BlockKind::P => "p",
    }
}
fn blocks_from(v: &Value) -> Vec<Block> {
    v.as_array()
        .expect("block array")
        .iter()
        .map(|blk| match s(&blk["type"]) {
            "pagebreak" => Block::PageBreak,
            t => Block::Text {
                kind: kind_from(t),
                runs: blk["runs"].as_array().expect("runs").iter().map(|r| Run { text: s(&r["text"]).to_string(), bold: b(&r["bold"]), italic: b(&r["italic"]) }).collect(),
            },
        })
        .collect()
}
fn blocks_to(blocks: &[Block]) -> Value {
    blocks
        .iter()
        .map(|blk| match blk {
            Block::PageBreak => json!({ "type": "pagebreak" }),
            Block::Text { kind, runs } => json!({
                "type": kind_to(*kind),
                "runs": runs.iter().map(|r| json!({ "text": r.text, "bold": r.bold, "italic": r.italic })).collect::<Vec<_>>(),
            }),
        })
        .collect()
}

// ---------- the ports, called with the JSON arguments ----------

/// Ok = the function's result in the TypeScript shape; Err = the user-facing error message.
fn run(name: &str, a: &[Value]) -> Result<Value, String> {
    Ok(match name {
        "parseTimecode" => json!(parse_timecode(s(&a[0]))),
        "formatTimecode" => json!(format_timecode(f(&a[0]))),
        "formatSrtTime" => json!(format_srt_time(f(&a[0]))),
        "formatVttTime" => json!(format_vtt_time(f(&a[0]))),
        "formatDuration" => json!(format_duration(f(&a[0]))),
        "formatBytes" => json!(format_bytes(a[0].as_u64().expect("byte count"))),

        "splitName" => {
            let (base, ext) = split_name(s(&a[0]));
            json!({ "base": base, "ext": ext })
        }
        "outputFileName" => json!(output_file_name(s(&a[0]), s(&a[1]), s(&a[2]))),
        "groupFolderName" => json!(group_folder_name(s(&a[0]), s(&a[1]))),
        "groupFileName" => json!(group_file_name(s(&a[0]), u(&a[1]), u(&a[2]), s(&a[3]))),
        "withCounter" => json!(with_counter(s(&a[0]), u(&a[1]))),
        "sanitizeFileName" => json!(sanitize_file_name(s(&a[0]))),

        "parsePageRanges" => json!(parse_page_ranges(s(&a[0]), u(&a[1]))?),
        "flattenRanges" => json!(flatten_ranges(&de::<Vec<Vec<usize>>>(&a[0]))),
        "splitGroups" => json!(split_groups(&de::<PdfSplitOptions>(&a[0]), u(&a[1]))?),
        "splitSegments" => {
            let segs = split_segments(f(&a[0]), &de::<VideoSplitOptions>(&a[1]));
            segs.iter().map(|g| json!({ "start": g.start, "end": g.end })).collect()
        }

        "clampNormRect" => json!(clamp_norm_rect(de::<NormRect>(&a[0]))),
        "toPixelRect" => {
            let r = to_pixel_rect(de::<NormRect>(&a[0]), u(&a[1]) as u32, u(&a[2]) as u32, b(&a[3]));
            json!({ "x": r.x, "y": r.y, "w": r.w, "h": r.h })
        }
        "isFullRect" => json!(is_full_rect(de::<NormRect>(&a[0]))),

        "decodeText" => json!(decode_text(&de::<Vec<u8>>(&a[0]))),
        "escapeXml" => json!(escape_xml(s(&a[0]))),
        "guessLang" => json!(guess_lang(s(&a[0]))),

        "parseSubtitles" => cues_to(&parse_subtitles(s(&a[0]))),
        "stripTags" => json!(strip_tags(s(&a[0]), b(&a[1]))),
        "toSrt" => json!(to_srt(&cues_from(&a[0]))),
        "toVtt" => json!(to_vtt(&cues_from(&a[0]))),
        "toPlainText" => json!(to_plain_text(&cues_from(&a[0]))),
        "shiftCues" => cues_to(&shift_cues(&cues_from(&a[0]), f(&a[1]))),
        "textToCues" => {
            let timing = if s(&a[1]["timing"]) == "fixed" { CueTimingMode::Fixed } else { CueTimingMode::Reading };
            cues_to(&text_to_cues(s(&a[0]), &TextToCuesOptions { timing, seconds_per_cue: f(&a[1]["secondsPerCue"]) }))
        }

        "collageCells" => {
            let l = collage_cells(u(&a[0]), de::<CollageLayoutKind>(&a[1]), f(&a[2]), f(&a[3]));
            let cells: Vec<Value> = l.cells.iter().map(|c| json!({ "x": c.x, "y": c.y, "w": c.w, "h": c.h })).collect();
            json!({ "width": l.width, "height": l.height, "cells": cells })
        }
        "buildEditSpec" => {
            let e = build_edit_spec(&with_defaults::<EditParams>(ToolId::ImageEdit, &a[0]));
            json!({
                "linear": e.linear.map(|(m, k)| json!([m, k])),
                "modulate": e.modulate.map(|(sat, hue)| json!({ "saturation": sat, "hue": hue })),
                "recomb": e.recomb,
                "grayscale": e.grayscale,
                "negate": e.negate,
                "sharpenSigma": e.sharpen_sigma,
                "blurSigma": e.blur_sigma,
                "vignette": e.vignette,
            })
        }

        "reflowPages" => blocks_to(&reflow_pages(&pages_from(&a[0]), a[1]["pageBreaks"].as_bool().unwrap_or(false))),
        "isScanned" => json!(is_scanned(&pages_from(&a[0]))),
        "textToBlocks" => blocks_to(&text_to_blocks(s(&a[0]))),
        "blocksToText" => json!(blocks_to_text(&blocks_from(&a[0]))),
        "blocksToXhtml" => json!(blocks_to_xhtml(&blocks_from(&a[0]))),
        "splitChapters" => split_chapters(&blocks_from(&a[0]), s(&a[1]))
            .iter()
            .map(|c| json!({ "title": c.title, "blocks": blocks_to(&c.blocks) }))
            .collect(),

        other => panic!("no runner for {other}: add it to crates/core/tests/golden.rs"),
    })
}

/// Floats are compared to 9 decimal places, and 5 == 5.0 (JSON integers vs Rust f64 results).
fn norm(v: &Value) -> Value {
    match v {
        Value::Number(n) => {
            let x = n.as_f64().expect("finite number");
            json!((x * 1e9).round() / 1e9 + 0.0)
        }
        Value::Array(a) => Value::Array(a.iter().map(norm).collect()),
        Value::Object(o) => Value::Object(o.iter().map(|(k, x)| (k.clone(), norm(x))).collect()),
        other => other.clone(),
    }
}

#[test]
fn every_golden_file_is_listed() {
    let dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../../../src/shared/golden");
    let mut on_disk: Vec<String> = std::fs::read_dir(&dir)
        .expect("golden folder")
        .flatten()
        .map(|e| e.file_name().to_string_lossy().to_string())
        .filter(|n| n.ends_with(".json"))
        .collect();
    on_disk.sort();
    let listed: Vec<String> = FILES.iter().map(|(n, _)| n.to_string()).collect();
    assert_eq!(on_disk, listed, "add new golden files to FILES (and to src/shared/golden.test.ts)");
}

#[test]
fn rust_ports_match_the_golden_cases() {
    let mut failures = Vec::new();
    let mut count = 0;
    for (file, text) in FILES {
        let groups: serde_json::Map<String, Value> = serde_json::from_str(text).unwrap_or_else(|e| panic!("{file}: {e}"));
        for (name, cases) in groups.iter().filter(|(k, _)| !k.starts_with('_')) {
            for (i, case) in cases.as_array().expect("case list").iter().enumerate() {
                count += 1;
                let args = case["args"].as_array().expect("args array");
                let label = format!("{file} {name} case {}: {}", i + 1, case["args"]);
                match (run(name, args), case.get("err")) {
                    (Ok(got), None) if norm(&got) == norm(&case["out"]) => {}
                    (Err(msg), Some(want)) if want.as_str() == Some(msg.as_str()) => {}
                    (got, _) => failures.push(format!("{label}\n    expected {}\n    got      {got:?}", case.get("err").unwrap_or(&case["out"]))),
                }
            }
        }
    }
    assert!(count > 150, "only {count} golden cases ran");
    assert!(failures.is_empty(), "{} of {count} golden cases differ from TypeScript:\n{}", failures.len(), failures.join("\n"));
}
