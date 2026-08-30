use serde::Serialize;
use std::{
    fs,
    path::Path,
    time::{SystemTime, UNIX_EPOCH},
};
use walkdir::{DirEntry, WalkDir};

const MAX_MARKDOWN_FILE_BYTES: u64 = 1_048_576;
const MAX_MARKDOWN_FILES: usize = 5_000;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct VaultNote {
    relative_path: String,
    content: String,
    modified_at: u64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct VaultScanResult {
    vault_name: String,
    root_path: String,
    notes: Vec<VaultNote>,
    scanned_markdown_files: usize,
    scanned_at: u64,
}

fn is_visible_entry(entry: &DirEntry) -> bool {
    entry.depth() == 0 || !entry.file_name().to_string_lossy().starts_with('.')
}

fn has_fokusdeck_marker(content: &str) -> bool {
    let normalized = content.trim_start_matches('\u{feff}');
    let Some(frontmatter_body) = normalized.strip_prefix("---") else {
        return false;
    };

    let Some(frontmatter_end) = frontmatter_body.find("\n---") else {
        return false;
    };

    frontmatter_body[..frontmatter_end].lines().any(|line| {
        let Some((key, value)) = line.split_once(':') else {
            return false;
        };
        key.trim().eq_ignore_ascii_case("fokusdeck")
            && value
                .trim()
                .trim_matches(&['\'', '"'][..])
                .eq_ignore_ascii_case("true")
    })
}

fn modified_millis(path: &Path) -> u64 {
    fs::metadata(path)
        .and_then(|metadata| metadata.modified())
        .ok()
        .and_then(|modified| modified.duration_since(UNIX_EPOCH).ok())
        .map(|duration| duration.as_millis() as u64)
        .unwrap_or(0)
}

#[tauri::command]
fn scan_obsidian_vault(vault_path: String) -> Result<VaultScanResult, String> {
    let root = fs::canonicalize(&vault_path)
        .map_err(|_| "Der ausgewählte Vault-Ordner wurde nicht gefunden.".to_string())?;

    if !root.is_dir() {
        return Err("Der ausgewählte Pfad ist kein Ordner.".to_string());
    }

    if !root.join(".obsidian").is_dir() {
        return Err(
            "In diesem Ordner wurde keine .obsidian-Konfiguration gefunden. Bitte wähle den Hauptordner deines Vaults."
                .to_string(),
        );
    }

    let mut notes = Vec::new();
    let mut scanned_markdown_files = 0usize;

    for entry in WalkDir::new(&root)
        .follow_links(false)
        .into_iter()
        .filter_entry(is_visible_entry)
        .filter_map(Result::ok)
    {
        if !entry.file_type().is_file() {
            continue;
        }

        let is_markdown = entry
            .path()
            .extension()
            .and_then(|extension| extension.to_str())
            .is_some_and(|extension| extension.eq_ignore_ascii_case("md"));
        if !is_markdown {
            continue;
        }

        scanned_markdown_files += 1;
        if scanned_markdown_files > MAX_MARKDOWN_FILES {
            break;
        }

        let Ok(metadata) = entry.metadata() else {
            continue;
        };
        if metadata.len() > MAX_MARKDOWN_FILE_BYTES {
            continue;
        }

        let Ok(content) = fs::read_to_string(entry.path()) else {
            continue;
        };
        if !has_fokusdeck_marker(&content) {
            continue;
        }

        let Ok(relative_path) = entry.path().strip_prefix(&root) else {
            continue;
        };
        notes.push(VaultNote {
            relative_path: relative_path.to_string_lossy().replace('\\', "/"),
            content,
            modified_at: modified_millis(entry.path()),
        });
    }

    notes.sort_by(|left, right| left.relative_path.cmp(&right.relative_path));

    let vault_name = root
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("Obsidian Vault")
        .to_string();

    Ok(VaultScanResult {
        vault_name,
        root_path: root.to_string_lossy().to_string(),
        notes,
        scanned_markdown_files,
        scanned_at: SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|duration| duration.as_millis() as u64)
            .unwrap_or(0),
    })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![scan_obsidian_vault])
        .run(tauri::generate_context!())
        .expect("error while running FokusDeck");
}

#[cfg(test)]
mod tests {
    use super::has_fokusdeck_marker;

    #[test]
    fn detects_enabled_frontmatter_marker() {
        assert!(has_fokusdeck_marker(
            "---\nfokusdeck: true\ndeck: Biologie\n---\n# Frage"
        ));
    }

    #[test]
    fn ignores_disabled_or_body_markers() {
        assert!(!has_fokusdeck_marker(
            "---\nfokusdeck: false\n---\nfokusdeck: true"
        ));
        assert!(!has_fokusdeck_marker("# Notiz\nfokusdeck: true"));
    }
}
