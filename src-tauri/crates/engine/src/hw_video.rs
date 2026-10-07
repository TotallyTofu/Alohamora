//! Port of src/main/engines/hwVideo.ts: find a working hardware H.264 encoder with a 1-frame test encode.

use crate::capabilities;
use crate::ffmpeg::run_ffmpeg_to_buffer;

fn candidates() -> &'static [&'static str] {
    if cfg!(target_os = "macos") {
        &["h264_videotoolbox"]
    } else if cfg!(windows) {
        &["h264_nvenc", "h264_qsv", "h264_amf"]
    } else {
        &["h264_nvenc"]
    }
}

/// Test-encode one black frame with each candidate; store the first that works. Run on a background thread.
pub fn detect_hardware_video() {
    let caps = capabilities::get();
    for enc in candidates() {
        if !caps.encoders.iter().any(|e| e == enc) {
            continue;
        }
        let args: Vec<String> = ["-f", "lavfi", "-i", "color=c=black:s=256x256:d=0.1", "-frames:v", "1", "-c:v", enc, "-f", "null", "-"]
            .iter()
            .map(|s| s.to_string())
            .collect();
        if run_ffmpeg_to_buffer(&args, None).is_ok() {
            capabilities::set_hardware_video(Some(enc.to_string()));
            log::info!("Hardware video encoder OK: {enc}");
            return;
        }
        log::info!("Hardware video encoder unavailable: {enc}");
    }
    capabilities::set_hardware_video(None);
}
