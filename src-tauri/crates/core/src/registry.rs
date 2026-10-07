//! The data tables shared with the UI. Source of truth: src/shared/registry/*.json
//! (the TypeScript files formats.ts, tools.ts, toolOptions.ts and types.ts read the same JSON).

use std::collections::HashMap;
use std::sync::OnceLock;

use serde::Deserialize;
use serde_json::Value;

use crate::types::{Category, Fmt, Settings, ToolId};

const FORMATS_JSON: &str = include_str!("../../../../src/shared/registry/formats.json");
const TOOLS_JSON: &str = include_str!("../../../../src/shared/registry/tools.json");
const DEFAULTS_JSON: &str = include_str!("../../../../src/shared/registry/defaults.json");

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FormatInfo {
    pub fmt: Fmt,
    pub label: String,
    pub category: Category,
    /// First = canonical output extension.
    pub exts: Vec<String>,
    pub mimes: Vec<String>,
    /// false = output-only (DOCX, EPUB).
    pub input: bool,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolMeta {
    pub id: ToolId,
    pub category: Category,
    pub label: String,
    pub icon: String,
    pub description: String,
    pub min_inputs: usize,
    pub max_inputs: usize,
    /// true = run once per input file.
    pub per_file: bool,
    /// Output name suffix ("" = none).
    pub suffix: String,
    #[serde(default)]
    pub instant: bool,
    #[serde(default)]
    pub extra: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct FormatsFile {
    formats: HashMap<Fmt, FormatInfo>,
    convert_targets: HashMap<Category, Vec<Fmt>>,
}

#[derive(Debug, Deserialize)]
struct ToolsFile {
    tools: Vec<ToolMeta>,
}

pub struct Registry {
    pub formats: HashMap<Fmt, FormatInfo>,
    pub convert_targets: HashMap<Category, Vec<Fmt>>,
    pub tools: Vec<ToolMeta>,
    /// The whole defaults.json: keys "settings", "convert", "edit", "tools".
    pub defaults: Value,
    ext_index: HashMap<String, Fmt>,
}

static REGISTRY: OnceLock<Registry> = OnceLock::new();

/// The registry, parsed once. Panics only if the JSON files are broken (a unit test catches that).
pub fn get() -> &'static Registry {
    REGISTRY.get_or_init(|| {
        let f: FormatsFile = serde_json::from_str(FORMATS_JSON).expect("formats.json");
        let t: ToolsFile = serde_json::from_str(TOOLS_JSON).expect("tools.json");
        let defaults: Value = serde_json::from_str(DEFAULTS_JSON).expect("defaults.json");
        let mut ext_index = HashMap::new();
        for info in f.formats.values() {
            if !info.input {
                continue;
            }
            for e in &info.exts {
                ext_index.insert(e.clone(), info.fmt);
            }
        }
        Registry { formats: f.formats, convert_targets: f.convert_targets, tools: t.tools, defaults, ext_index }
    })
}

/// "C:\\a\\b.JPEG" → "jpeg" (lower-case, no dot). Works with / and \.
pub fn ext_of(file_path: &str) -> String {
    let name = file_path.rsplit(['/', '\\']).next().unwrap_or("");
    match name.rfind('.') {
        Some(dot) if dot > 0 => name[dot + 1..].to_lowercase(),
        _ => String::new(),
    }
}

/// Input formats only (DOCX and EPUB are output-only).
pub fn fmt_from_ext(ext: &str) -> Option<Fmt> {
    get().ext_index.get(&ext.to_lowercase()).copied()
}

pub fn fmt_from_path(file_path: &str) -> Option<Fmt> {
    fmt_from_ext(&ext_of(file_path))
}

pub fn format(fmt: Fmt) -> &'static FormatInfo {
    &get().formats[&fmt]
}

pub fn category_of(fmt: Fmt) -> Category {
    format(fmt).category
}

pub fn label(fmt: Fmt) -> &'static str {
    &format(fmt).label
}

/// Canonical extension to write for a format, e.g. jpg → "jpg", tiff → "tiff".
pub fn output_ext(fmt: Fmt) -> &'static str {
    &format(fmt).exts[0]
}

pub fn convert_targets(category: Category) -> &'static [Fmt] {
    get().convert_targets.get(&category).map(|v| v.as_slice()).unwrap_or(&[])
}

pub fn tool_meta(id: ToolId) -> &'static ToolMeta {
    get().tools.iter().find(|t| t.id == id).expect("every ToolId is in tools.json")
}

/// defaults.json → tools → `<id>` (an object; `{}` for tools without options).
pub fn tool_defaults(id: ToolId) -> &'static Value {
    &get().defaults["tools"][id.as_str().as_str()]
}

pub fn default_settings() -> Settings {
    serde_json::from_value(get().defaults["settings"].clone()).expect("defaults.json settings")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn registry_parses_and_is_consistent() {
        let r = get();
        assert_eq!(r.formats.len(), Fmt::ALL.len());
        assert_eq!(r.tools.len(), 36);
        for t in &r.tools {
            assert!(tool_defaults(t.id).is_object(), "defaults for {}", t.id.as_str());
        }
        let _ = default_settings();
    }

    #[test]
    fn extensions() {
        assert_eq!(ext_of("C:\\x\\Photo.JPEG"), "jpeg");
        assert_eq!(ext_of("noext"), "");
        assert_eq!(ext_of(".bashrc"), "");
        assert_eq!(ext_of("/a/b.c/file.tar.gz"), "gz");
        assert_eq!(fmt_from_path("a.jpeg"), Some(Fmt::Jpg));
        assert_eq!(fmt_from_path("a.jfif"), Some(Fmt::Jpg));
        assert_eq!(fmt_from_path("a.tif"), Some(Fmt::Tiff));
        assert_eq!(fmt_from_path("a.heif"), Some(Fmt::Heic));
        assert_eq!(fmt_from_path("a.m4v"), Some(Fmt::Mp4));
        assert_eq!(fmt_from_path("a.aac"), Some(Fmt::M4a));
        assert_eq!(fmt_from_path("a.md"), Some(Fmt::Txt));
        assert_eq!(fmt_from_path("a.docx"), None);
        assert_eq!(fmt_from_path("a.epub"), None, "EPUB is output-only since EPUB to PDF was removed");
        assert_eq!(output_ext(Fmt::Tiff), "tiff");
        assert_eq!(label(Fmt::Webm), "WebM");
        assert_eq!(category_of(Fmt::Epub), Category::Pdf);
    }

    #[test]
    fn tools() {
        assert!(tool_meta(ToolId::VideoMute).instant);
        assert_eq!(tool_meta(ToolId::PdfMerge).min_inputs, 2);
        assert!(convert_targets(Category::Audio).contains(&Fmt::Mp3));
    }
}
