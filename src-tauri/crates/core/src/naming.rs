//! Port of src/shared/naming.ts (output names).

/// "a.b.mp4" → ("a.b", "mp4"); ".bashrc" → (".bashrc", "")
pub fn split_name(file_name: &str) -> (String, String) {
    match file_name.rfind('.') {
        Some(dot) if dot > 0 => (file_name[..dot].to_string(), file_name[dot + 1..].to_string()),
        _ => (file_name.to_string(), String::new()),
    }
}

/// ("clip", "mp4", "trimmed") → "clip-trimmed.mp4"; an empty suffix adds nothing.
pub fn output_file_name(base: &str, ext: &str, suffix: &str) -> String {
    if suffix.is_empty() { format!("{base}.{ext}") } else { format!("{base}-{suffix}.{ext}") }
}

pub fn group_folder_name(base: &str, group: &str) -> String {
    format!("{base}-{group}")
}

/// ("report", 3, 120, "jpg") → "report-003.jpg" (padding grows with total).
pub fn group_file_name(base: &str, index: usize, total: usize, ext: &str) -> String {
    let pad = std::cmp::max(3, total.to_string().len());
    format!("{base}-{index:0pad$}.{ext}")
}

/// ("a.jpg", 2) → "a (2).jpg"; ("folder", 1) → "folder (1)"
pub fn with_counter(name: &str, n: usize) -> String {
    let (base, ext) = split_name(name);
    if ext.is_empty() { format!("{name} ({n})") } else { format!("{base} ({n}).{ext}") }
}

/// First free path: name, name (1), name (2)… `exists` and `join` are passed in so this stays pure.
pub fn resolve_collision(
    dir: &str,
    name: &str,
    exists: &dyn Fn(&str) -> bool,
    join: &dyn Fn(&str, &str) -> String,
) -> Result<String, String> {
    let mut candidate = join(dir, name);
    let mut n = 1;
    while exists(&candidate) {
        if n > 9999 {
            return Err("Too many files with the same name".to_string());
        }
        candidate = join(dir, &with_counter(name, n));
        n += 1;
    }
    Ok(candidate)
}

/// Remove characters Windows forbids; trim trailing dots/spaces; limit the length to 180 characters.
pub fn sanitize_file_name(name: &str) -> String {
    let replaced: String = name
        .chars()
        .map(|c| if "<>:\"/\\|?*".contains(c) || (c as u32) < 0x20 { '_' } else { c })
        .collect();
    let mut s = replaced.trim_end_matches(['.', ' ']).trim().to_string();
    if s.is_empty() {
        s = "output".to_string();
    }
    if s.chars().count() > 180 {
        let (base, ext) = split_name(&s);
        let short: String = base.chars().take(170).collect();
        s = if ext.is_empty() { short } else { format!("{short}.{ext}") };
    }
    s
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashSet;

    #[test]
    fn names() {
        assert_eq!(split_name("a.b.mp4"), ("a.b".into(), "mp4".into()));
        assert_eq!(split_name(".bashrc"), (".bashrc".into(), "".into()));
        assert_eq!(split_name("README"), ("README".into(), "".into()));
        assert_eq!(output_file_name("clip", "mp4", "trimmed"), "clip-trimmed.mp4");
        assert_eq!(output_file_name("photo", "jpg", ""), "photo.jpg");
        assert_eq!(group_folder_name("report", "pages"), "report-pages");
        assert_eq!(group_file_name("report", 3, 120, "jpg"), "report-003.jpg");
        assert_eq!(group_file_name("report", 7, 12345, "jpg"), "report-00007.jpg");
        assert_eq!(with_counter("a.jpg", 2), "a (2).jpg");
        assert_eq!(with_counter("folder", 1), "folder (1)");
    }

    #[test]
    fn collisions() {
        let join = |a: &str, b: &str| format!("{a}\\{b}");
        let taken: HashSet<String> = ["C:\\out\\a.jpg".to_string(), "C:\\out\\a (1).jpg".to_string()].into();
        let exists = |p: &str| taken.contains(p);
        assert_eq!(resolve_collision("C:\\out", "a.jpg", &exists, &join).unwrap(), "C:\\out\\a (2).jpg");
        assert_eq!(resolve_collision("C:\\out", "b.jpg", &exists, &join).unwrap(), "C:\\out\\b.jpg");
        assert!(resolve_collision("/o", "a.jpg", &|_| true, &join).is_err());
    }

    #[test]
    fn sanitize() {
        assert_eq!(sanitize_file_name("a<b>:c\"d/e\\f|g?h*i"), "a_b__c_d_e_f_g_h_i");
        assert_eq!(sanitize_file_name("name. "), "name");
        assert_eq!(sanitize_file_name("   "), "output");
        let long = sanitize_file_name(&format!("{}.png", "x".repeat(300)));
        assert!(long.chars().count() <= 180);
        assert!(long.ends_with(".png"));
    }
}
