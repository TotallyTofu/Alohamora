//! All self-test cases (same names and groups as the Electron build).

mod av;
mod errors;
mod image;
mod pdf;
mod text;
mod tools_audio;
mod tools_image;
mod tools_pdf;
mod tools_video;

use alohamora_core::types::{Fmt, JobRequest, ToolId};
use serde_json::Value;

use super::assert::Check;
use super::{Case, Expect};

pub fn all() -> Vec<Case> {
    let mut v = Vec::new();
    v.extend(av::cases());
    v.extend(image::cases());
    v.extend(text::cases());
    v.extend(pdf::cases());
    v.extend(tools_video::cases());
    v.extend(tools_audio::cases());
    v.extend(tools_image::cases());
    v.extend(tools_pdf::cases());
    v.extend(tools_pdf::subtitle_cases());
    v.extend(errors::cases());
    v
}

fn convert_request(target: Fmt, options: Option<Value>) -> super::RequestFn {
    Box::new(move |inputs: &[String]| JobRequest::Convert {
        inputs: inputs.to_vec(),
        target,
        options: options.clone().map(|o| serde_json::from_value(o).expect("valid convert options in a case")),
    })
}

fn tool_request(tool: ToolId, options: Value) -> super::RequestFn {
    Box::new(move |inputs: &[String]| JobRequest::Tool { inputs: inputs.to_vec(), tool_id: tool, options: options.clone() })
}

/// A conversion that must succeed and pass `check`.
pub fn convert_case(
    name: &str, group: &'static str, fixtures: &[&'static str], target: Fmt, options: Option<Value>,
    check: impl Fn(&[String]) -> Check + Send + Sync + 'static,
) -> Case {
    Case { name: name.into(), group, fixtures: fixtures.to_vec(), request: convert_request(target, options), expect: Expect::Check(Box::new(check)), skip: None, caps_override: None }
}

/// A tool run that must succeed and pass `check`.
pub fn tool_case(
    name: &str, group: &'static str, fixtures: &[&'static str], tool: ToolId, options: Value,
    check: impl Fn(&[String]) -> Check + Send + Sync + 'static,
) -> Case {
    Case { name: name.into(), group, fixtures: fixtures.to_vec(), request: tool_request(tool, options), expect: Expect::Check(Box::new(check)), skip: None, caps_override: None }
}

/// A conversion that must fail with a message matching `pattern`.
pub fn convert_error(name: &str, group: &'static str, fixtures: &[&'static str], target: Fmt, options: Option<Value>, pattern: &'static str) -> Case {
    Case { name: name.into(), group, fixtures: fixtures.to_vec(), request: convert_request(target, options), expect: Expect::Error(pattern), skip: None, caps_override: None }
}

/// A tool run that must fail with a message matching `pattern`.
pub fn tool_error(name: &str, group: &'static str, fixtures: &[&'static str], tool: ToolId, options: Value, pattern: &'static str) -> Case {
    Case { name: name.into(), group, fixtures: fixtures.to_vec(), request: tool_request(tool, options), expect: Expect::Error(pattern), skip: None, caps_override: None }
}
