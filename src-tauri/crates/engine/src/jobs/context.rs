//! Port of src/main/jobs/context.ts. Converters and tools write ONLY to paths from `new_output` / `temp_path`.
//! `finalize` moves outputs to their final names (never overwriting anything).

use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};

use alohamora_core::naming::{group_file_name, group_folder_name, output_file_name, resolve_collision, sanitize_file_name, split_name};
use alohamora_core::types::{Capabilities, Settings};
use alohamora_core::util::path_key;

use crate::cancel::CancelToken;
use crate::fsutil::{move_file, remove_dir_with_retries};
use crate::paths;
use crate::{AppError, Result};

/// Describes one output file. Build with `OutputSpec::new(source, ext)` and the builder methods.
#[derive(Debug, Clone)]
pub struct OutputSpec {
    /// Input file this output derives from (decides folder + base name).
    pub source: String,
    /// Output extension without dot.
    pub ext: String,
    /// "compressed" → "<base>-compressed.<ext>". Empty = no suffix.
    pub suffix: String,
    /// Multi-file output → folder "<base>-<group>/<base>-001.ext".
    pub group: Option<String>,
    /// 1-based (group only).
    pub index: usize,
    /// Group size (for zero padding).
    pub total: usize,
    /// Full file name (rare).
    pub name_override: Option<String>,
}

impl OutputSpec {
    pub fn new(source: &str, ext: &str) -> Self {
        OutputSpec { source: source.to_string(), ext: ext.trim_start_matches('.').to_lowercase(), suffix: String::new(), group: None, index: 1, total: 1, name_override: None }
    }
    pub fn suffix(mut self, suffix: &str) -> Self {
        self.suffix = suffix.to_string();
        self
    }
    pub fn group(mut self, group: &str, index: usize, total: usize) -> Self {
        self.group = Some(group.to_string());
        self.index = index;
        self.total = total;
        self
    }
}

struct Inner {
    outputs: Vec<(PathBuf, OutputSpec)>,
    dropped: HashSet<PathBuf>,
    sub_index: usize,
    sub_total: usize,
    scratch: usize,
    notes: Vec<String>,
}

pub type ProgressFn = Box<dyn Fn(f64, Option<String>) + Send + Sync>;

pub struct JobContext {
    pub id: String,
    pub cancel: CancelToken,
    pub temp_dir: PathBuf,
    pub settings: Settings,
    pub caps: Capabilities,
    report: ProgressFn,
    inner: Mutex<Inner>,
}

/// Final paths reserved by running jobs, so two parallel jobs never pick the same name.
fn reserved() -> &'static Mutex<HashSet<String>> {
    static R: OnceLock<Mutex<HashSet<String>>> = OnceLock::new();
    R.get_or_init(|| Mutex::new(HashSet::new()))
}

impl JobContext {
    pub fn new(id: &str, cancel: CancelToken, settings: Settings, caps: Capabilities, report: ProgressFn) -> Result<Self> {
        let temp_dir = paths::jobs_temp_root().join(id);
        std::fs::create_dir_all(&temp_dir)?;
        Ok(JobContext {
            id: id.to_string(),
            cancel,
            temp_dir,
            settings,
            caps,
            report,
            inner: Mutex::new(Inner { outputs: vec![], dropped: HashSet::new(), sub_index: 0, sub_total: 1, scratch: 0, notes: vec![] }),
        })
    }

    /// Err(Canceled) once the job was cancelled. Call inside loops.
    pub fn check_cancel(&self) -> Result<()> {
        self.cancel.check()
    }

    pub fn set_subtask(&self, index: usize, total: usize, detail: Option<String>) {
        let total = total.max(1);
        {
            let mut i = self.inner.lock().expect("job ctx");
            i.sub_index = index;
            i.sub_total = total;
        }
        (self.report)(index as f64 / total as f64, detail);
    }

    /// 0..1 within the current subtask.
    pub fn progress(&self, fraction: f64, detail: Option<String>) {
        let f = fraction.clamp(0.0, 1.0);
        let (index, total) = {
            let i = self.inner.lock().expect("job ctx");
            (i.sub_index, i.sub_total)
        };
        (self.report)((index as f64 + f) / total as f64, detail);
    }

    /// Returns the temp path to write this output to.
    pub fn new_output(&self, spec: OutputSpec) -> PathBuf {
        let mut i = self.inner.lock().expect("job ctx");
        let p = self.temp_dir.join(format!("out-{}.{}", i.outputs.len(), spec.ext));
        i.outputs.push((p.clone(), spec));
        p
    }

    /// For example: the compressed file came out bigger than the original.
    pub fn drop_output(&self, temp_path: &Path) {
        self.inner.lock().expect("job ctx").dropped.insert(temp_path.to_path_buf());
    }

    /// A scratch file path (not an output).
    pub fn temp_path(&self, name: &str) -> PathBuf {
        let mut i = self.inner.lock().expect("job ctx");
        i.scratch += 1;
        self.temp_dir.join(format!("tmp-{}-{}", i.scratch, name))
    }

    /// Text shown on the Done card.
    pub fn note(&self, text: impl Into<String>) {
        self.inner.lock().expect("job ctx").notes.push(text.into());
    }

    pub fn notes(&self) -> Vec<String> {
        self.inner.lock().expect("job ctx").notes.clone()
    }

    /// Move outputs to their final names. Returns final absolute paths.
    pub fn finalize(&self, inputs: &[String]) -> Result<Vec<String>> {
        let (outputs, dropped) = {
            let i = self.inner.lock().expect("job ctx");
            (i.outputs.clone(), i.dropped.clone())
        };
        let input_keys: HashSet<String> = inputs.iter().map(|p| path_key(Path::new(p))).collect();
        let mut group_dirs: std::collections::HashMap<String, PathBuf> = std::collections::HashMap::new();
        let mut finals = Vec::new();
        let mut mine: Vec<String> = Vec::new();
        let result = (|| -> Result<()> {
            for (temp, spec) in &outputs {
                if dropped.contains(temp) {
                    continue;
                }
                if !temp.exists() {
                    let name = temp.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default();
                    return Err(AppError::other(format!("Expected output was not created ({name})")));
                }
                let source = Path::new(&spec.source);
                let (base, _) = split_name(&source.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default());
                let custom = self.settings.output_mode == "custom-folder" && self.settings.custom_output_dir.is_some();
                let out_dir: PathBuf = if custom {
                    PathBuf::from(self.settings.custom_output_dir.clone().unwrap_or_default())
                } else {
                    source.parent().map(|p| p.to_path_buf()).unwrap_or_default()
                };
                let taken = |p: &str| reserved().lock().expect("reserved").contains(&path_key(Path::new(p))) || Path::new(p).exists();
                let join = |a: &str, b: &str| paths::p2s(&Path::new(a).join(b));
                let final_path: String = if let Some(group) = &spec.group {
                    let key = format!("{}|{}", spec.source, group);
                    let dir = match group_dirs.get(&key) {
                        Some(d) => d.clone(),
                        None => {
                            let d = resolve_collision(&paths::p2s(&out_dir), &sanitize_file_name(&group_folder_name(&base, group)), &taken, &join)
                                .map_err(AppError::other)?;
                            std::fs::create_dir_all(&d)?;
                            group_dirs.insert(key, PathBuf::from(&d));
                            PathBuf::from(d)
                        }
                    };
                    let name = sanitize_file_name(&group_file_name(&base, spec.index, spec.total, &spec.ext));
                    resolve_collision(&paths::p2s(&dir), &name, &taken, &join).map_err(AppError::other)?
                } else {
                    let name = spec.name_override.clone().unwrap_or_else(|| output_file_name(&base, &spec.ext, &spec.suffix));
                    resolve_collision(&paths::p2s(&out_dir), &sanitize_file_name(&name), &taken, &join).map_err(AppError::other)?
                };
                let key = path_key(Path::new(&final_path));
                if input_keys.contains(&key) {
                    return Err(AppError::other("Refusing to overwrite an input file"));
                }
                reserved().lock().expect("reserved").insert(key.clone());
                mine.push(key);
                move_file(temp, Path::new(&final_path))?;
                finals.push(final_path);
            }
            Ok(())
        })();
        let mut r = reserved().lock().expect("reserved");
        for k in &mine {
            r.remove(k);
        }
        result.map(|_| finals)
    }

    pub fn cleanup(&self) {
        remove_dir_with_retries(&self.temp_dir);
    }
}
