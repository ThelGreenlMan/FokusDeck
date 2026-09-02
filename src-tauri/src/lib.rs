use serde::Serialize;
use std::{
    fs::{self, File, OpenOptions},
    io::{self, Write},
    path::{Path, PathBuf},
    sync::atomic::{AtomicU64, Ordering},
    time::{SystemTime, UNIX_EPOCH},
};
use walkdir::{DirEntry, WalkDir};

const MAX_MARKDOWN_FILE_BYTES: u64 = 1_048_576;
const MAX_MARKDOWN_FILES: usize = 5_000;
const MAX_COLLECTION_FILE_BYTES: u64 = 33_554_432;
const MAX_CSV_FILE_BYTES: u64 = 16_777_216;
const AUXILIARY_FILE_ATTEMPTS: usize = 128;
static AUXILIARY_FILE_COUNTER: AtomicU64 = AtomicU64::new(0);

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

fn is_collection_path(path: &Path) -> bool {
    path.file_name()
        .and_then(|name| name.to_str())
        .is_some_and(|name| name.to_ascii_lowercase().ends_with(".fokusdeck.json"))
}

fn is_csv_path(path: &Path) -> bool {
    path.extension()
        .and_then(|extension| extension.to_str())
        .is_some_and(|extension| extension.eq_ignore_ascii_case("csv"))
}

struct TemporaryFileGuard {
    path: PathBuf,
}

impl Drop for TemporaryFileGuard {
    fn drop(&mut self) {
        let _ = fs::remove_file(&self.path);
    }
}

fn auxiliary_path(parent: &Path, purpose: &str) -> PathBuf {
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_nanos())
        .unwrap_or(0);
    let counter = AUXILIARY_FILE_COUNTER.fetch_add(1, Ordering::Relaxed);
    parent.join(format!(
        ".fokusdeck-{purpose}-{}-{timestamp:x}-{counter:x}.tmp",
        std::process::id()
    ))
}

fn create_temporary_file(parent: &Path) -> io::Result<(TemporaryFileGuard, File)> {
    for _ in 0..AUXILIARY_FILE_ATTEMPTS {
        let path = auxiliary_path(parent, "write");
        match OpenOptions::new().write(true).create_new(true).open(&path) {
            Ok(file) => return Ok((TemporaryFileGuard { path }, file)),
            Err(error) if error.kind() == io::ErrorKind::AlreadyExists => continue,
            Err(error) => return Err(error),
        }
    }

    Err(io::Error::new(
        io::ErrorKind::AlreadyExists,
        "Kein eindeutiger temporärer Dateiname verfügbar.",
    ))
}

fn validate_collection_target(path: &Path) -> Result<Option<fs::Permissions>, String> {
    match fs::symlink_metadata(path) {
        Ok(metadata) => {
            if metadata.file_type().is_symlink() || !metadata.is_file() {
                return Err("Das ausgewählte Ziel ist keine reguläre Datei.".to_string());
            }
            if metadata.permissions().readonly() {
                return Err("Die vorhandene Sammlungsdatei ist schreibgeschützt.".to_string());
            }
            Ok(Some(metadata.permissions()))
        }
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(None),
        Err(_) => Err("Die vorhandene Datei konnte nicht geprüft werden.".to_string()),
    }
}

#[cfg(not(windows))]
fn replace_temporary_file(temporary_path: &Path, target_path: &Path) -> Result<(), String> {
    fs::rename(temporary_path, target_path)
        .map_err(|_| "Die Sammlung konnte nicht sicher ersetzt werden.".to_string())
}

#[cfg(windows)]
fn move_target_to_backup(target_path: &Path) -> Result<PathBuf, String> {
    let parent = target_path
        .parent()
        .ok_or_else(|| "Der Zielordner fehlt.".to_string())?;

    for _ in 0..AUXILIARY_FILE_ATTEMPTS {
        let backup_path = auxiliary_path(parent, "backup");
        match fs::rename(target_path, &backup_path) {
            Ok(()) => return Ok(backup_path),
            Err(_) if fs::symlink_metadata(&backup_path).is_ok() => continue,
            Err(_) => {
                return Err(
                    "Die vorhandene Sammlung konnte nicht sicher vorbereitet werden.".to_string(),
                );
            }
        }
    }

    Err("Für die vorhandene Sammlung konnte keine Sicherungsdatei angelegt werden.".to_string())
}

#[cfg(windows)]
fn replace_temporary_file(temporary_path: &Path, target_path: &Path) -> Result<(), String> {
    if fs::rename(temporary_path, target_path).is_ok() {
        return Ok(());
    }

    let metadata = fs::symlink_metadata(target_path)
        .map_err(|_| "Die Sammlung konnte nicht sicher ersetzt werden.".to_string())?;
    if metadata.file_type().is_symlink() || !metadata.is_file() {
        return Err("Das ausgewählte Ziel ist keine reguläre Datei.".to_string());
    }

    let backup_path = move_target_to_backup(target_path)?;
    if fs::rename(temporary_path, target_path).is_err() {
        return match fs::rename(&backup_path, target_path) {
            Ok(()) => Err(
                "Die Sammlung konnte nicht ersetzt werden; die vorhandene Datei wurde wiederhergestellt."
                    .to_string(),
            ),
            Err(_) => Err(format!(
                "Die Sammlung konnte nicht ersetzt werden. Die vorhandenen Daten liegen weiterhin unter {}.",
                backup_path.display()
            )),
        };
    }

    fs::remove_file(&backup_path).map_err(|_| {
        format!(
            "Die Sammlung wurde gespeichert, aber die temporäre Sicherung {} konnte nicht entfernt werden.",
            backup_path.display()
        )
    })
}

#[cfg(unix)]
fn sync_parent_directory(parent: &Path) {
    if let Ok(directory) = File::open(parent) {
        let _ = directory.sync_all();
    }
}

#[cfg(not(unix))]
fn sync_parent_directory(_parent: &Path) {}

fn decode_windows_1252(bytes: &[u8]) -> String {
    bytes
        .iter()
        .map(|byte| match byte {
            0x80 => '€',
            0x82 => '‚',
            0x83 => 'ƒ',
            0x84 => '„',
            0x85 => '…',
            0x86 => '†',
            0x87 => '‡',
            0x88 => 'ˆ',
            0x89 => '‰',
            0x8A => 'Š',
            0x8B => '‹',
            0x8C => 'Œ',
            0x8E => 'Ž',
            0x91 => '‘',
            0x92 => '’',
            0x93 => '“',
            0x94 => '”',
            0x95 => '•',
            0x96 => '–',
            0x97 => '—',
            0x98 => '˜',
            0x99 => '™',
            0x9A => 'š',
            0x9B => '›',
            0x9C => 'œ',
            0x9E => 'ž',
            0x9F => 'Ÿ',
            value => char::from(*value),
        })
        .collect()
}

fn decode_csv_bytes(bytes: Vec<u8>) -> String {
    String::from_utf8(bytes).unwrap_or_else(|error| decode_windows_1252(&error.into_bytes()))
}

#[tauri::command]
fn read_csv_file(path: String) -> Result<String, String> {
    let requested_path = Path::new(&path);
    if !is_csv_path(requested_path) {
        return Err("Bitte wähle eine Datei mit der Endung .csv aus.".to_string());
    }

    let metadata = fs::symlink_metadata(requested_path)
        .map_err(|_| "Die ausgewählte CSV-Datei wurde nicht gefunden.".to_string())?;
    if metadata.file_type().is_symlink() || !metadata.is_file() {
        return Err("Der ausgewählte Pfad ist keine reguläre CSV-Datei.".to_string());
    }
    if metadata.len() > MAX_CSV_FILE_BYTES {
        return Err("Die CSV-Datei ist größer als 16 MB.".to_string());
    }

    let csv_path = fs::canonicalize(requested_path)
        .map_err(|_| "Die ausgewählte CSV-Datei wurde nicht gefunden.".to_string())?;
    let bytes =
        fs::read(csv_path).map_err(|_| "Die CSV-Datei konnte nicht gelesen werden.".to_string())?;
    Ok(decode_csv_bytes(bytes))
}

#[tauri::command]
fn read_collection_file(path: String) -> Result<String, String> {
    let requested_path = Path::new(&path);
    if !is_collection_path(requested_path) {
        return Err("Bitte wähle eine Datei mit der Endung .fokusdeck.json aus.".to_string());
    }

    let collection_path = fs::canonicalize(requested_path)
        .map_err(|_| "Die ausgewählte Sammlungsdatei wurde nicht gefunden.".to_string())?;
    if !collection_path.is_file() {
        return Err("Der ausgewählte Pfad ist keine Datei.".to_string());
    }
    let metadata = fs::metadata(&collection_path)
        .map_err(|_| "Die Sammlungsdatei konnte nicht geprüft werden.".to_string())?;
    if metadata.len() > MAX_COLLECTION_FILE_BYTES {
        return Err("Die Sammlungsdatei ist größer als 32 MB.".to_string());
    }

    fs::read_to_string(collection_path)
        .map_err(|_| "Die Sammlungsdatei konnte nicht als Text gelesen werden.".to_string())
}

#[tauri::command]
fn write_collection_file(path: String, content: String) -> Result<(), String> {
    let requested_path = Path::new(&path);
    if !is_collection_path(requested_path) {
        return Err("Der Dateiname muss auf .fokusdeck.json enden.".to_string());
    }
    if content.len() as u64 > MAX_COLLECTION_FILE_BYTES {
        return Err("Die Sammlung ist größer als 32 MB.".to_string());
    }

    let parent = requested_path
        .parent()
        .ok_or_else(|| "Der Zielordner fehlt.".to_string())?;
    let canonical_parent =
        fs::canonicalize(parent).map_err(|_| "Der Zielordner wurde nicht gefunden.".to_string())?;
    if !canonical_parent.is_dir() {
        return Err("Der Zielpfad ist kein Ordner.".to_string());
    }
    let file_name = requested_path
        .file_name()
        .ok_or_else(|| "Der Dateiname fehlt.".to_string())?;
    let safe_path = canonical_parent.join(file_name);
    validate_collection_target(&safe_path)?;

    let (temporary_file, mut file) = create_temporary_file(&canonical_parent)
        .map_err(|_| "Die temporäre Sammlungsdatei konnte nicht angelegt werden.".to_string())?;
    let write_result = (|| -> io::Result<()> {
        file.write_all(content.as_bytes())?;
        file.flush()?;
        file.sync_all()
    })();
    drop(file);
    write_result.map_err(|_| {
        "Die Sammlung konnte nicht vollständig in die temporäre Datei geschrieben werden."
            .to_string()
    })?;

    if let Some(permissions) = validate_collection_target(&safe_path)? {
        fs::set_permissions(&temporary_file.path, permissions).map_err(|_| {
            "Die Dateiberechtigungen der vorhandenen Sammlung konnten nicht übernommen werden."
                .to_string()
        })?;
    }

    replace_temporary_file(&temporary_file.path, &safe_path)?;
    sync_parent_directory(&canonical_parent);
    Ok(())
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
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            scan_obsidian_vault,
            read_collection_file,
            write_collection_file,
            read_csv_file
        ])
        .run(tauri::generate_context!())
        .expect("error while running FokusDeck");
}

#[cfg(test)]
mod tests {
    use super::{decode_csv_bytes, has_fokusdeck_marker, is_collection_path, is_csv_path};
    use std::path::Path;

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

    #[test]
    fn accepts_only_fokusdeck_collection_files() {
        assert!(is_collection_path(Path::new("Prüfung.fokusdeck.json")));
        assert!(is_collection_path(Path::new("PRÜFUNG.FOKUSDECK.JSON")));
        assert!(!is_collection_path(Path::new("Prüfung.json")));
        assert!(!is_collection_path(Path::new("Prüfung.txt")));
    }

    #[test]
    fn accepts_csv_files_case_insensitively() {
        assert!(is_csv_path(Path::new("Karten.csv")));
        assert!(is_csv_path(Path::new("Karten.CSV")));
        assert!(!is_csv_path(Path::new("Karten.csv.txt")));
    }

    #[test]
    fn reads_utf8_and_windows_1252_csv_text() {
        assert_eq!(
            decode_csv_bytes("Rückseite".as_bytes().to_vec()),
            "Rückseite"
        );
        assert_eq!(decode_csv_bytes(vec![82, 252, 99, 107]), "Rück");
    }
}
