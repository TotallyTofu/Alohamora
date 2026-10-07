//! Port of src/main/settings.ts: settings.json with per-key sanitizing and atomic writes.

use std::path::PathBuf;
use std::sync::{Arc, Mutex, OnceLock};

use alohamora_core::registry;
use alohamora_core::types::Settings;
use serde_json::{Map, Value};

use crate::Result;

type Listener = Arc<dyn Fn(&Settings, &Settings) + Send + Sync>;

struct Store {
    file: PathBuf,
    current: Settings,
    listeners: Vec<Listener>,
}

static STORE: OnceLock<Mutex<Store>> = OnceLock::new();

fn store() -> &'static Mutex<Store> {
    STORE.get().expect("settings::load must be called at start-up")
}

/// JSON types must match the default's: null default → null or string; array → array; else same kind.
fn same_type(default: &Value, v: &Value) -> bool {
    match default {
        Value::Null => v.is_null() || v.is_string(),
        Value::Array(_) => v.is_array(),
        Value::Bool(_) => v.is_boolean(),
        Value::Number(_) => v.is_number(),
        Value::String(_) => v.is_string(),
        Value::Object(_) => v.is_object(),
    }
}

/// Keep only known keys whose type matches the default. One bad key never resets the others.
pub fn sanitize(raw: &Value) -> Map<String, Value> {
    let defaults = &registry::get().defaults["settings"];
    let mut out = Map::new();
    let (Some(defs), Some(raw)) = (defaults.as_object(), raw.as_object()) else { return out };
    for (k, def) in defs {
        if let Some(v) = raw.get(k) {
            if same_type(def, v) {
                out.insert(k.clone(), v.clone());
            }
        }
    }
    out
}

fn merge(base: &Settings, patch: &Map<String, Value>) -> Settings {
    let mut v = serde_json::to_value(base).expect("settings serialize");
    if let Some(obj) = v.as_object_mut() {
        for (k, val) in patch {
            obj.insert(k.clone(), val.clone());
        }
    }
    serde_json::from_value(v).unwrap_or_else(|_| base.clone())
}

/// Load settings.json from `config_dir` (missing or broken file → defaults). Call once at start-up.
pub fn load(config_dir: PathBuf) -> Settings {
    let _ = std::fs::create_dir_all(&config_dir);
    let file = config_dir.join("settings.json");
    let defaults = registry::default_settings();
    let current = std::fs::read_to_string(&file)
        .ok()
        .and_then(|t| serde_json::from_str::<Value>(&t).ok())
        .map(|raw| merge(&defaults, &sanitize(&raw)))
        .unwrap_or(defaults);
    let s = current.clone();
    if STORE.set(Mutex::new(Store { file, current, listeners: Vec::new() })).is_err() {
        let mut st = store().lock().expect("settings");
        st.current = s.clone();
    }
    s
}

/// Settings without the file (self-test, unit tests).
pub fn load_defaults_in_memory() {
    let _ = STORE.set(Mutex::new(Store { file: PathBuf::new(), current: registry::default_settings(), listeners: Vec::new() }));
}

pub fn get() -> Settings {
    store().lock().expect("settings").current.clone()
}

/// Merge a (sanitized) patch, save atomically (tmp + rename), notify listeners with (new, previous).
pub fn update(patch: &Value) -> Result<Settings> {
    let (next, prev, listeners) = {
        let mut st = store().lock().expect("settings");
        let prev = st.current.clone();
        let next = merge(&prev, &sanitize(patch));
        if !st.file.as_os_str().is_empty() {
            let tmp = st.file.with_extension("json.tmp");
            std::fs::write(&tmp, serde_json::to_string_pretty(&next)?)?;
            std::fs::rename(&tmp, &st.file)?;
        }
        st.current = next.clone();
        (next, prev, st.listeners.clone())
    };
    for l in listeners {
        l(&next, &prev);
    }
    Ok(next)
}

/// Called after every change with (new, previous).
pub fn on_changed(cb: impl Fn(&Settings, &Settings) + Send + Sync + 'static) {
    store().lock().expect("settings").listeners.push(Arc::new(cb));
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn sanitizes_per_key() {
        let s = sanitize(&json!({ "imageQuality": 70, "theme": 5, "customOutputDir": null, "ocrLanguages": "eng", "nope": 1 }));
        assert_eq!(s.get("imageQuality"), Some(&json!(70)));
        assert!(s.get("theme").is_none());
        assert_eq!(s.get("customOutputDir"), Some(&Value::Null));
        assert!(s.get("ocrLanguages").is_none());
        assert!(s.get("nope").is_none());
        let merged = merge(&registry::default_settings(), &s);
        assert_eq!(merged.image_quality, 70.0);
        assert_eq!(merged.theme, "system");
    }
}
