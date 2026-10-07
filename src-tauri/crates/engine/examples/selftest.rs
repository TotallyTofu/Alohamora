//! Dev runner for the engine self-test without the Tauri app:
//! cargo run -p alohamora-engine --example selftest -- <bin_dir> <resource_dir> <work_dir> [--only=<group|prefix>]
use std::path::PathBuf;

use alohamora_engine::{capabilities, paths, selftest, settings};

fn main() {
    let args: Vec<String> = std::env::args().collect();
    let arg = |i: usize| PathBuf::from(args.get(i).expect("usage: selftest <bin_dir> <resource_dir> <work_dir> [--only=x]"));
    let (bin_dir, resource_dir, work) = (arg(1), arg(2), arg(3));
    let only = args.iter().find_map(|a| a.strip_prefix("--only=").map(String::from));
    paths::init(paths::Paths {
        bin_dir,
        resource_dir,
        config_dir: work.join("config"),
        cache_dir: work.join("cache"),
        data_dir: work.join("data"),
        jobs_temp_root: std::env::temp_dir().join("alohamora-jobs"),
        app_version: env!("CARGO_PKG_VERSION").into(),
    });
    settings::load_defaults_in_memory();
    capabilities::detect();
    std::process::exit(selftest::run(only.as_deref(), &work.join("selftest")));
}
