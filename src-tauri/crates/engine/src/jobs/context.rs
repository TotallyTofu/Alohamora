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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::paths::p2s;
    use crate::test_util::{init_paths, TempDir};
    use alohamora_core::registry::default_settings;

    fn ctx(settings: Settings) -> JobContext {
        init_paths();
        let id = format!("test-{}", uuid::Uuid::new_v4());
        JobContext::new(&id, CancelToken::new(), settings, crate::capabilities::get(), Box::new(|_, _| {})).expect("job context")
    }

    fn output(c: &JobContext, spec: OutputSpec, data: &[u8]) -> PathBuf {
        let p = c.new_output(spec);
        std::fs::write(&p, data).unwrap();
        p
    }

    fn name(p: &str) -> String {
        Path::new(p).file_name().unwrap().to_string_lossy().to_string()
    }

    #[test]
    fn output_specs() {
        let s = OutputSpec::new("/in/clip.mp4", ".JPG").suffix("frame").group("frames", 2, 30);
        assert_eq!((s.ext.as_str(), s.suffix.as_str(), s.group.as_deref(), s.index, s.total), ("jpg", "frame", Some("frames"), 2, 30));
    }

    #[test]
    fn outputs_go_next_to_the_input_and_never_overwrite() {
        let dir = TempDir::new("finalize");
        let input = dir.file("clip.mp4", b"input");
        let existing = dir.file("clip-trimmed.mp4", b"older result");
        let c = ctx(default_settings());
        output(&c, OutputSpec::new(&p2s(&input), "mp4").suffix("trimmed"), b"new result");
        let finals = c.finalize(&[p2s(&input)]).expect("finalize");
        c.cleanup();
        assert_eq!(finals.iter().map(|p| name(p)).collect::<Vec<_>>(), ["clip-trimmed (1).mp4"]);
        assert_eq!(std::fs::read(&finals[0]).unwrap(), b"new result");
        assert_eq!(std::fs::read(&existing).unwrap(), b"older result", "the earlier file is untouched");
        assert_eq!(std::fs::read(&input).unwrap(), b"input");
    }

    #[test]
    fn grouped_outputs_get_their_own_folder() {
        let dir = TempDir::new("group");
        let input = dir.file("report.pdf", b"%PDF");
        std::fs::create_dir(dir.path().join("report-pages")).unwrap();
        let c = ctx(default_settings());
        for i in 1..=3 {
            output(&c, OutputSpec::new(&p2s(&input), "png").group("pages", i, 3), &[i as u8]);
        }
        let finals = c.finalize(&[p2s(&input)]).expect("finalize");
        c.cleanup();
        let folder = dir.path().join("report-pages (1)");
        let want: Vec<String> = ["report-001.png", "report-002.png", "report-003.png"].iter().map(|n| p2s(&folder.join(n))).collect();
        assert_eq!(finals, want, "an existing folder is not reused");
        assert_eq!(std::fs::read(&finals[2]).unwrap(), [3]);
    }

    #[test]
    fn custom_folder_dropped_and_missing_outputs() {
        let dir = TempDir::new("custom");
        let out_dir = TempDir::new("custom-out");
        let input = dir.file("a.png", b"png");
        let mut settings = default_settings();
        settings.output_mode = "custom-folder".into();
        settings.custom_output_dir = Some(p2s(out_dir.path()));
        let c = ctx(settings);
        output(&c, OutputSpec::new(&p2s(&input), "webp"), b"kept");
        let dropped = output(&c, OutputSpec::new(&p2s(&input), "jpg"), b"bigger than the original");
        c.drop_output(&dropped);
        let finals = c.finalize(&[p2s(&input)]).expect("finalize");
        c.cleanup();
        assert_eq!(finals, [p2s(&out_dir.path().join("a.webp"))]);
        assert!(!out_dir.path().join("a.jpg").exists());
        assert!(!c.temp_dir.exists(), "cleanup removes the job folder");

        let c = ctx(default_settings());
        c.new_output(OutputSpec::new(&p2s(&input), "gif"));
        let err = c.finalize(&[p2s(&input)]).expect_err("a missing output is an error");
        c.cleanup();
        assert_eq!(err.to_string(), "Expected output was not created (out-0.gif)");
    }

    #[test]
    fn progress_is_spread_over_subtasks() {
        init_paths();
        let seen = std::sync::Arc::new(Mutex::new(Vec::new()));
        let sink = seen.clone();
        let c = JobContext::new(&format!("test-{}", uuid::Uuid::new_v4()), CancelToken::new(), default_settings(), crate::capabilities::get(), Box::new(move |p, _| sink.lock().unwrap().push(p)))
            .expect("job context");
        c.set_subtask(1, 4, None);
        c.progress(0.5, None);
        c.progress(7.0, None);
        c.cleanup();
        assert_eq!(*seen.lock().unwrap(), [0.25, 0.375, 0.5]);
        c.cancel.cancel();
        assert!(c.check_cancel().unwrap_err().is_canceled());
    }
}
