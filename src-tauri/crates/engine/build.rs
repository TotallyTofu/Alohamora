// Records the target triple so `paths::sidecar` can find `ffmpeg-<triple>` in src-tauri/binaries (dev runs).
fn main() {
    println!("cargo:rustc-env=ALOHAMORA_TARGET_TRIPLE={}", std::env::var("TARGET").expect("cargo sets TARGET"));
}
