//! Port of src/main/engines/imageMeta.ts: lossless metadata removal by rewriting file segments.

/// Lossless: drop EXIF/XMP (APP1), IPTC (APP13), comments and other APPn segments. Keeps JFIF, Adobe and (optionally) ICC.
pub fn strip_jpeg_metadata(buf: &[u8], keep_icc: bool) -> Result<Vec<u8>, String> {
    if buf.len() < 2 || buf[0] != 0xff || buf[1] != 0xd8 {
        return Err("Not a JPEG file".to_string());
    }
    let mut out: Vec<u8> = buf[..2].to_vec();
    let mut i = 2;
    while i + 4 <= buf.len() {
        if buf[i] != 0xff {
            return Err("Corrupt JPEG".to_string());
        }
        let marker = buf[i + 1];
        if marker == 0xff {
            i += 1;
            continue;
        }
        if marker == 0xda || marker == 0xd9 {
            out.extend_from_slice(&buf[i..]);
            return Ok(out);
        }
        if marker == 0x01 || (0xd0..=0xd7).contains(&marker) {
            out.extend_from_slice(&buf[i..i + 2]);
            i += 2;
            continue;
        }
        let len = ((buf[i + 2] as usize) << 8) | buf[i + 3] as usize;
        let end = (i + 2 + len).min(buf.len());
        let seg = &buf[i..end];
        let is_app = (0xe0..=0xef).contains(&marker);
        let is_icc = marker == 0xe2 && keep_icc && seg.len() >= 16 && &seg[4..16] == b"ICC_PROFILE\0";
        let keep = if marker == 0xfe { false } else if !is_app { true } else { marker == 0xe0 || marker == 0xee || is_icc };
        if keep {
            out.extend_from_slice(seg);
        }
        i += 2 + len;
    }
    Ok(out)
}

const PNG_SIG: [u8; 8] = [137, 80, 78, 71, 13, 10, 26, 10];

/// Lossless: drop text/EXIF/time chunks from a PNG.
pub fn strip_png_metadata(buf: &[u8]) -> Result<Vec<u8>, String> {
    if buf.len() < 8 || buf[..8] != PNG_SIG {
        return Err("Not a PNG file".to_string());
    }
    let mut out: Vec<u8> = buf[..8].to_vec();
    let mut i = 8;
    while i + 12 <= buf.len() {
        let len = u32::from_be_bytes([buf[i], buf[i + 1], buf[i + 2], buf[i + 3]]) as usize;
        let kind = &buf[i + 4..i + 8];
        let end = (i + 12 + len).min(buf.len());
        let drop = matches!(kind, b"tEXt" | b"zTXt" | b"iTXt" | b"eXIf" | b"tIME");
        if !drop {
            out.extend_from_slice(&buf[i..end]);
        }
        i = end;
        if kind == b"IEND" {
            break;
        }
    }
    Ok(out)
}

/// Set the EXIF Orientation tag (0x0112, in IFD0) to 1 in raw TIFF-structured EXIF data, in place.
/// Used when pixels were already rotated, so viewers must not rotate them again.
/// Returns true when the tag was found. Malformed data is left untouched.
pub fn reset_exif_orientation(tiff: &mut [u8]) -> bool {
    if tiff.len() < 8 {
        return false;
    }
    let le = match &tiff[..2] {
        b"II" => true,
        b"MM" => false,
        _ => return false,
    };
    let u16_at = |b: &[u8], i: usize| if le { u16::from_le_bytes([b[i], b[i + 1]]) } else { u16::from_be_bytes([b[i], b[i + 1]]) };
    let u32_at = |b: &[u8], i: usize| {
        let a = [b[i], b[i + 1], b[i + 2], b[i + 3]];
        if le { u32::from_le_bytes(a) } else { u32::from_be_bytes(a) }
    };
    let ifd = u32_at(tiff, 4) as usize;
    if ifd + 2 > tiff.len() {
        return false;
    }
    let count = u16_at(tiff, ifd) as usize;
    for k in 0..count {
        let e = ifd + 2 + k * 12;
        if e + 12 > tiff.len() {
            return false;
        }
        if u16_at(tiff, e) == 0x0112 && u16_at(tiff, e + 2) == 3 {
            let one = if le { 1u16.to_le_bytes() } else { 1u16.to_be_bytes() };
            tiff[e + 8] = one[0];
            tiff[e + 9] = one[1];
            return true;
        }
    }
    false
}

/// Width, height and colour component count (1 = grey, 3 = YCbCr/RGB, 4 = CMYK) from a JPEG's SOF header.
pub fn jpeg_sof_info(buf: &[u8]) -> Option<(u32, u32, u8)> {
    if buf.len() < 4 || buf[0] != 0xff || buf[1] != 0xd8 {
        return None;
    }
    let mut i = 2;
    while i + 4 <= buf.len() {
        if buf[i] != 0xff {
            return None;
        }
        let marker = buf[i + 1];
        if marker == 0xff {
            i += 1;
            continue;
        }
        if marker == 0x01 || (0xd0..=0xd7).contains(&marker) {
            i += 2;
            continue;
        }
        if marker == 0xda || marker == 0xd9 {
            return None;
        }
        let len = u16::from_be_bytes([buf[i + 2], buf[i + 3]]) as usize;
        let is_sof = (0xc0..=0xcf).contains(&marker) && !matches!(marker, 0xc4 | 0xc8 | 0xcc);
        if is_sof && i + 10 <= buf.len() {
            let h = u16::from_be_bytes([buf[i + 5], buf[i + 6]]) as u32;
            let w = u16::from_be_bytes([buf[i + 7], buf[i + 8]]) as u32;
            return Some((w, h, buf[i + 9]));
        }
        i += 2 + len;
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    fn has_marker(b: &[u8], hi: u8, lo: u8) -> bool {
        b.windows(2).any(|w| w[0] == hi && w[1] == lo)
    }

    #[test]
    fn jpeg() {
        let mut j = vec![0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10];
        j.extend(b"JFIF\0");
        j.extend([1, 1, 0, 0, 1, 0, 1, 0, 0]);
        j.extend([0xff, 0xe1, 0x00, 0x08]);
        j.extend(b"Exif");
        j.extend([0, 0, 0xff, 0xfe, 0x00, 0x05]);
        j.extend(b"hi!");
        j.extend([0xff, 0xda, 0x00, 0x04, 0x01, 0x02, 0x11, 0x22, 0x33, 0xff, 0xd9]);
        let out = strip_jpeg_metadata(&j, true).unwrap();
        assert!(has_marker(&out, 0xff, 0xe0));
        assert!(!has_marker(&out, 0xff, 0xe1));
        assert!(!has_marker(&out, 0xff, 0xfe));
        assert!(out.windows(4).any(|w| w == b"JFIF"));
        assert!(!out.windows(4).any(|w| w == b"Exif"));
        assert_eq!(&out[out.len() - 2..], &[0xff, 0xd9]);
        assert!(strip_jpeg_metadata(b"PNG....", true).unwrap_err().contains("Not a JPEG"));
    }

    #[test]
    fn png() {
        let chunk = |kind: &[u8], data: &[u8]| {
            let mut c = vec![0, 0, 0, data.len() as u8];
            c.extend(kind);
            c.extend(data);
            c.extend([0, 0, 0, 0]);
            c
        };
        let mut p = PNG_SIG.to_vec();
        p.extend(chunk(b"IHDR", &[0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0]));
        p.extend(chunk(b"tEXt", &[75, 0, 118]));
        p.extend(chunk(b"IDAT", &[1, 2, 3]));
        p.extend(chunk(b"IEND", &[]));
        let out = strip_png_metadata(&p).unwrap();
        assert!(!out.windows(4).any(|w| w == b"tEXt"));
        assert!(out.windows(4).any(|w| w == b"IDAT") && out.windows(4).any(|w| w == b"IEND"));
        assert!(out.len() < p.len());
        assert!(strip_png_metadata(&[1, 2, 3, 4, 5, 6, 7, 8]).unwrap_err().contains("Not a PNG"));
    }

    #[test]
    fn orientation_reset() {
        // Little-endian TIFF, IFD0 at 8 with one entry: Orientation SHORT 1 value 6.
        let mut t = b"II*\0".to_vec();
        t.extend(8u32.to_le_bytes());
        t.extend(1u16.to_le_bytes());
        t.extend(0x0112u16.to_le_bytes());
        t.extend(3u16.to_le_bytes());
        t.extend(1u32.to_le_bytes());
        t.extend([6, 0, 0, 0]);
        t.extend(0u32.to_le_bytes());
        assert!(reset_exif_orientation(&mut t));
        assert_eq!(t[18], 1);
        assert!(!reset_exif_orientation(&mut b"junk".to_vec()));
    }

    #[test]
    fn sof_info() {
        let mut j = vec![0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0, 0];
        j.extend([0xff, 0xc0, 0x00, 0x11, 8, 0x01, 0x2c, 0x01, 0x90, 3]);
        assert_eq!(jpeg_sof_info(&j), Some((400, 300, 3)));
        assert_eq!(jpeg_sof_info(b"nope"), None);
    }
}
