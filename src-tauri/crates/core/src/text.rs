//! Port of src/shared/text.ts (the parts the backend uses).

/// Decode text bytes: UTF-8 (with/without BOM), UTF-16 LE/BE with BOM. Invalid UTF-8 becomes U+FFFD.
pub fn decode_text(bytes: &[u8]) -> String {
    if bytes.starts_with(&[0xef, 0xbb, 0xbf]) {
        return String::from_utf8_lossy(&bytes[3..]).to_string();
    }
    if bytes.starts_with(&[0xff, 0xfe]) {
        let (s, _) = encoding_rs::UTF_16LE.decode_without_bom_handling(&bytes[2..]);
        return s.to_string();
    }
    if bytes.starts_with(&[0xfe, 0xff]) {
        let (s, _) = encoding_rs::UTF_16BE.decode_without_bom_handling(&bytes[2..]);
        return s.to_string();
    }
    String::from_utf8_lossy(bytes).to_string()
}

pub fn escape_xml(s: &str) -> String {
    s.replace('&', "&amp;").replace('<', "&lt;").replace('>', "&gt;").replace('"', "&quot;").replace('\'', "&apos;")
}

/// Rough language guess for EPUB metadata: "vi" when Vietnamese letters appear, else "en".
pub fn guess_lang(text: &str) -> &'static str {
    const VI: &str = "ăâđêôơưạảấầẩẫậắằẳẵặẹẻẽếềểễệỉịọỏốồổỗộớờởỡợụủứừửữựỳỵỷỹ";
    if text.to_lowercase().chars().any(|c| VI.contains(c)) { "vi" } else { "en" }
}

/// Font size in points for each TXT → PDF size option (`TEXT_SIZE_PT`).
pub fn text_size_pt(size: crate::options::TextSize) -> f64 {
    use crate::options::TextSize::*;
    match size {
        Small => 9.5,
        Medium => 11.0,
        Large => 13.0,
        Xlarge => 16.0,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn decoding() {
        assert_eq!(decode_text(&[0xef, 0xbb, 0xbf, 0x48, 0x69]), "Hi");
        assert_eq!(decode_text(&[0xff, 0xfe, 0x41, 0x00]), "A");
        assert_eq!(decode_text(&[0xfe, 0xff, 0x00, 0x42]), "B");
        assert_eq!(decode_text("Tiếng Việt".as_bytes()), "Tiếng Việt");
    }

    #[test]
    fn xml_and_lang() {
        assert_eq!(escape_xml("<a & \"b\">"), "&lt;a &amp; &quot;b&quot;&gt;");
        assert_eq!(escape_xml("it's"), "it&apos;s");
        assert_eq!(guess_lang("Xin chào thế giới"), "vi");
        assert_eq!(guess_lang("Hello world"), "en");
    }
}
