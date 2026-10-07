//! JavaScript-compatible number formatting.
//! FFmpeg arguments, file names and notes must be byte-for-byte the same as the Electron build,
//! so every place where TypeScript turned a number into a string uses one of these helpers.

/// Like JavaScript `String(n)` / `${n}` for the numbers this app uses (no exponent forms).
/// `2.0` → `"2"`, `0.5` → `"0.5"`, `-0.0` → `"0"`.
pub fn js_num(n: f64) -> String {
    if n.is_nan() {
        return "NaN".to_string();
    }
    if n.is_infinite() {
        return if n > 0.0 { "Infinity".to_string() } else { "-Infinity".to_string() };
    }
    if n == 0.0 {
        return "0".to_string();
    }
    format!("{}", n)
}

/// Like JavaScript `n.toFixed(digits)`: rounds the exact binary value, ties go away from zero
/// (`0.125.toFixed(2)` is `"0.13"`, while Rust's `{:.2}` would give `"0.12"`).
pub fn js_to_fixed(n: f64, digits: usize) -> String {
    if !n.is_finite() {
        return js_num(n);
    }
    let negative = n < 0.0;
    // 30 extra digits of the exact decimal expansion are enough to see whether we are above, below or on a tie.
    let long = format!("{:.*}", digits + 30, n.abs());
    let (int_part, frac_part) = match long.split_once('.') {
        Some((i, f)) => (i.to_string(), f.to_string()),
        None => (long.clone(), String::new()),
    };
    let keep: Vec<u8> = int_part.bytes().chain(frac_part.bytes().take(digits)).collect();
    let next = frac_part.as_bytes().get(digits).copied().unwrap_or(b'0');
    let mut digits_vec: Vec<u8> = keep.iter().map(|b| b - b'0').collect();
    if next >= b'5' {
        // round half up on the magnitude
        let mut i = digits_vec.len();
        loop {
            if i == 0 {
                digits_vec.insert(0, 1);
                break;
            }
            i -= 1;
            if digits_vec[i] == 9 {
                digits_vec[i] = 0;
            } else {
                digits_vec[i] += 1;
                break;
            }
        }
    }
    let int_len = digits_vec.len() - digits;
    let mut out = String::new();
    for d in &digits_vec[..int_len] {
        out.push((b'0' + d) as char);
    }
    if digits > 0 {
        out.push('.');
        for d in &digits_vec[int_len..] {
            out.push((b'0' + d) as char);
        }
    }
    let is_zero = digits_vec.iter().all(|d| *d == 0);
    if negative && !is_zero {
        format!("-{}", out)
    } else {
        out
    }
}

/// Like JavaScript `Math.round(x)`: halves round towards +infinity (`-2.5` → `-2`, `2.5` → `3`).
pub fn js_round(x: f64) -> f64 {
    let f = x.floor();
    if x - f >= 0.5 { f + 1.0 } else { f }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn num() {
        assert_eq!(js_num(2.0), "2");
        assert_eq!(js_num(0.5), "0.5");
        assert_eq!(js_num(-0.0), "0");
        assert_eq!(js_num(1000.0), "1000");
        assert_eq!(js_num(0.1 + 0.2), "0.30000000000000004");
        assert_eq!(js_num(-1.5), "-1.5");
    }

    #[test]
    fn to_fixed() {
        assert_eq!(js_to_fixed(0.125, 2), "0.13");
        assert_eq!(js_to_fixed(1.005, 2), "1.00");
        assert_eq!(js_to_fixed(2.0, 3), "2.000");
        assert_eq!(js_to_fixed(1.0 / 3.0, 4), "0.3333");
        assert_eq!(js_to_fixed(9.9999, 2), "10.00");
        assert_eq!(js_to_fixed(-0.125, 2), "-0.13");
        assert_eq!(js_to_fixed(-0.001, 2), "0.00");
        assert_eq!(js_to_fixed(5.41, 2), "5.41");
        assert_eq!(js_to_fixed(1.5, 0), "2");
    }

    #[test]
    fn round() {
        assert_eq!(js_round(2.5), 3.0);
        assert_eq!(js_round(-2.5), -2.0);
        assert_eq!(js_round(-2.6), -3.0);
        assert_eq!(js_round(0.49999999999999994), 0.0);
        assert_eq!(js_round(90.4), 90.0);
    }
}
