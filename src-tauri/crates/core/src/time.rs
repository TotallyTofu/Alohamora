//! Port of src/shared/time.ts.

use crate::js::js_to_fixed;

pub fn clamp(v: f64, min: f64, max: f64) -> f64 {
    v.max(min).min(max)
}

/// "1:02:03.5" | "02:03" | "75" | "00:00:01,500" → seconds (None if invalid).
pub fn parse_timecode(input: &str) -> Option<f64> {
    let s = input.trim().replacen(',', ".", 1);
    let re = regex::Regex::new(r"^\d+(:\d{1,2}){0,2}(\.\d+)?$").expect("valid regex");
    if !re.is_match(&s) {
        return None;
    }
    let mut sec = 0.0;
    for p in s.split(':') {
        sec = sec * 60.0 + p.parse::<f64>().ok()?;
    }
    if sec.is_finite() { Some(sec) } else { None }
}

fn pad(n: f64, w: usize) -> String {
    format!("{:0w$}", n.floor() as u64)
}

/// 5.41 → "0:05.41"; 3725.5 → "1:02:05.50".
pub fn format_timecode(sec: f64) -> String {
    let s = sec.max(0.0);
    let h = (s / 3600.0).floor();
    let m = ((s % 3600.0) / 60.0).floor();
    let rest = s % 60.0;
    let cs = ((rest - rest.floor()) * 100.0).floor();
    let core = format!("{}.{}", pad(rest, 2), pad(cs, 2));
    if h > 0.0 { format!("{}:{}:{}", h, pad(m, 2), core) } else { format!("{}:{}", m, core) }
}

fn hms(sec: f64, sep: char) -> String {
    let ms = (sec.max(0.0) * 1000.0).round() as u64;
    let h = ms / 3_600_000;
    let m = (ms % 3_600_000) / 60_000;
    let s = (ms % 60_000) / 1000;
    format!("{:02}:{:02}:{:02}{}{:03}", h, m, s, sep, ms % 1000)
}

pub fn format_srt_time(sec: f64) -> String {
    hms(sec, ',')
}

pub fn format_vtt_time(sec: f64) -> String {
    hms(sec, '.')
}

/// 65 → "1:05"; 3725 → "1:02:05"
pub fn format_duration(sec: f64) -> String {
    let s = crate::js::js_round(sec.max(0.0)) as u64;
    let h = s / 3600;
    let m = (s % 3600) / 60;
    if h > 0 { format!("{}:{:02}:{:02}", h, m, s % 60) } else { format!("{}:{:02}", m, s % 60) }
}

/// Explorer-style sizes (1024 based): "12.3 MB".
pub fn format_bytes(n: u64) -> String {
    if n < 1024 {
        return format!("{n} B");
    }
    let units = ["KB", "MB", "GB", "TB"];
    let mut v = n as f64 / 1024.0;
    let mut i = 0;
    while v >= 1024.0 && i < units.len() - 1 {
        v /= 1024.0;
        i += 1;
    }
    let num = if v >= 100.0 { js_to_fixed(v, 0) } else { js_to_fixed(v, 1) };
    format!("{} {}", num, units[i])
}

/// UTC calendar parts (year, month, day, hour, minute, second) of a Unix time in seconds.
/// Days-to-civil algorithm by Howard Hinnant; exact for every date after 1970.
pub fn utc_from_unix(secs: i64) -> (i64, u32, u32, u32, u32, u32) {
    let (days, rem) = (secs.div_euclid(86_400), secs.rem_euclid(86_400));
    let z = days + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = (doy - (153 * mp + 2) / 5 + 1) as u32;
    let m = if mp < 10 { mp + 3 } else { mp - 9 } as u32;
    let y = yoe + era * 400 + if m <= 2 { 1 } else { 0 };
    (y, m, d, (rem / 3600) as u32, (rem % 3600 / 60) as u32, (rem % 60) as u32)
}

/// "2024-05-01T14:30:00Z" for a Unix time in seconds.
pub fn iso_utc(secs: i64) -> String {
    let (y, mo, d, h, mi, s) = utc_from_unix(secs);
    format!("{y:04}-{mo:02}-{d:02}T{h:02}:{mi:02}:{s:02}Z")
}

/// Current Unix time in seconds.
pub fn unix_now() -> i64 {
    std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_secs() as i64).unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn timecodes() {
        assert_eq!(clamp(5.0, 0.0, 3.0), 3.0);
        assert_eq!(parse_timecode("1:02:03.5"), Some(3723.5));
        assert_eq!(parse_timecode("00:00:01,500"), Some(1.5));
        assert_eq!(parse_timecode("02:03"), Some(123.0));
        assert_eq!(parse_timecode("75"), Some(75.0));
        assert_eq!(parse_timecode("abc"), None);
        assert_eq!(parse_timecode(""), None);
        assert_eq!(format_timecode(5.41), "0:05.41");
        assert_eq!(format_timecode(3725.5), "1:02:05.50");
        assert_eq!(format_duration(65.0), "1:05");
        assert_eq!(format_duration(3725.0), "1:02:05");
        assert_eq!(format_srt_time(3723.5), "01:02:03,500");
        assert_eq!(format_vtt_time(3723.5), "01:02:03.500");
        assert_eq!(format_srt_time(-4.0), "00:00:00,000");
    }

    #[test]
    fn bytes() {
        assert_eq!(format_bytes(512), "512 B");
        assert_eq!(format_bytes(1536), "1.5 KB");
        assert_eq!(format_bytes(5 * 1024 * 1024), "5.0 MB");
        assert_eq!(format_bytes(150 * 1024 * 1024), "150 MB");
    }

    #[test]
    fn utc_parts() {
        assert_eq!(utc_from_unix(0), (1970, 1, 1, 0, 0, 0));
        assert_eq!(iso_utc(1_714_573_800), "2024-05-01T14:30:00Z");
        assert_eq!(utc_from_unix(951_782_400), (2000, 2, 29, 0, 0, 0));
    }
}
