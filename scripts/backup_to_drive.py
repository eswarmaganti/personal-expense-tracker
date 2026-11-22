#!/usr/bin/env python3
"""
backup_to_drive.py
──────────────────
Copies the SQLite database to a timestamped file, uploads it to a specific
Google Drive folder, then prunes old backups in that folder keeping only
the N most recent files.

Setup
-----
1. pip install -r scripts/requirements.txt
2. Create a Google Cloud project, enable the Drive API, and download the
   OAuth2 client-secret JSON as  scripts/credentials.json
   (or set env var GDRIVE_CREDENTIALS_FILE to point elsewhere).
3. Run once manually so the OAuth consent screen appears:
       python3 scripts/backup_to_drive.py
   This writes scripts/token.json (or GDRIVE_TOKEN_FILE path).
4. Set GDRIVE_FOLDER_ID to your shared Drive folder ID.
5. Schedule with cron (see README / AGENTS.md for the cron line).

Environment variables (all optional — defaults shown)
------------------------------------------------------
DB_PATH               path to expense.db        ../backend/expense.db
GDRIVE_FOLDER_ID      Drive folder ID           (required — no default)
GDRIVE_CREDENTIALS_FILE  OAuth2 client JSON     scripts/credentials.json
GDRIVE_TOKEN_FILE     cached OAuth2 token       scripts/token.json
KEEP_BACKUPS          how many files to retain  30
LOG_FILE              log path                  scripts/backup.log
"""

import os
import shutil
import sys
import logging
from datetime import datetime, timezone
from pathlib import Path

# ── Paths & config ────────────────────────────────────────────────────────────

SCRIPT_DIR = Path(__file__).parent.resolve()
PROJECT_ROOT = SCRIPT_DIR.parent

DB_PATH = Path(os.getenv("DB_PATH", PROJECT_ROOT / "backend" / "expense.db"))
FOLDER_ID = os.getenv("GDRIVE_FOLDER_ID", "")
CREDENTIALS_FILE = Path(os.getenv("GDRIVE_CREDENTIALS_FILE", SCRIPT_DIR / "credentials.json"))
TOKEN_FILE = Path(os.getenv("GDRIVE_TOKEN_FILE", SCRIPT_DIR / "token.json"))
KEEP_BACKUPS = int(os.getenv("KEEP_BACKUPS", "30"))
LOG_FILE = Path(os.getenv("LOG_FILE", SCRIPT_DIR / "backup.log"))

SCOPES = ["https://www.googleapis.com/auth/drive.file"]

# ── Logging ───────────────────────────────────────────────────────────────────

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler(LOG_FILE),
    ],
)
log = logging.getLogger(__name__)


# ── Google Drive helpers ──────────────────────────────────────────────────────

def _get_drive_service():
    """Return an authenticated Google Drive v3 service object."""
    from google.oauth2.credentials import Credentials
    from google_auth_oauthlib.flow import InstalledAppFlow
    from google.auth.transport.requests import Request
    from googleapiclient.discovery import build

    creds = None
    if TOKEN_FILE.exists():
        creds = Credentials.from_authorized_user_file(str(TOKEN_FILE), SCOPES)

    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            creds.refresh(Request())
        else:
            if not CREDENTIALS_FILE.exists():
                raise FileNotFoundError(
                    f"OAuth2 credentials file not found: {CREDENTIALS_FILE}\n"
                    "Download it from Google Cloud Console → APIs & Services → Credentials."
                )
            flow = InstalledAppFlow.from_client_secrets_file(str(CREDENTIALS_FILE), SCOPES)
            creds = flow.run_local_server(port=0)
        TOKEN_FILE.write_text(creds.to_json())

    return build("drive", "v3", credentials=creds)


def _upload_file(service, local_path: Path, folder_id: str) -> str:
    """Upload local_path to Drive folder and return the new file ID."""
    from googleapiclient.http import MediaFileUpload

    file_metadata = {
        "name": local_path.name,
        "parents": [folder_id],
    }
    media = MediaFileUpload(str(local_path), mimetype="application/x-sqlite3", resumable=False)
    uploaded = service.files().create(
        body=file_metadata,
        media_body=media,
        fields="id,name,size",
    ).execute()
    return uploaded["id"]


def _prune_old_backups(service, folder_id: str, keep: int) -> int:
    """
    List all files in the Drive folder ordered by createdTime (oldest first),
    delete any beyond the `keep` most recent. Returns count of deleted files.
    """
    result = service.files().list(
        q=f"'{folder_id}' in parents and trashed = false",
        orderBy="createdTime asc",
        fields="files(id, name, createdTime)",
        pageSize=1000,
    ).execute()

    files = result.get("files", [])
    to_delete = files[: max(0, len(files) - keep)]
    for f in to_delete:
        service.files().delete(fileId=f["id"]).execute()
        log.info("  pruned old backup: %s", f["name"])
    return len(to_delete)


# ── Main ──────────────────────────────────────────────────────────────────────

def main() -> None:
    log.info("=== Expense Tracker — Google Drive backup ===")

    # Validate inputs
    if not DB_PATH.exists():
        log.error("Database not found: %s", DB_PATH)
        sys.exit(1)

    if not FOLDER_ID:
        log.error(
            "GDRIVE_FOLDER_ID is not set. "
            "Export it before running:\n"
            "  export GDRIVE_FOLDER_ID=<your_folder_id>"
        )
        sys.exit(1)

    # Create a timestamped copy of the database
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    backup_name = f"expense_backup_{stamp}.db"
    backup_path = SCRIPT_DIR / backup_name

    log.info("Creating snapshot: %s", backup_path)
    shutil.copy2(DB_PATH, backup_path)

    try:
        log.info("Authenticating with Google Drive …")
        service = _get_drive_service()

        log.info("Uploading %s → Drive folder %s …", backup_name, FOLDER_ID)
        file_id = _upload_file(service, backup_path, FOLDER_ID)
        log.info("Upload complete — Drive file ID: %s", file_id)

        deleted = _prune_old_backups(service, FOLDER_ID, KEEP_BACKUPS)
        if deleted:
            log.info("Pruned %d old backup(s), keeping last %d.", deleted, KEEP_BACKUPS)
        else:
            log.info("No pruning needed (%d backups in Drive).", KEEP_BACKUPS)

    finally:
        # Always remove the local snapshot copy
        backup_path.unlink(missing_ok=True)
        log.info("Local snapshot removed.")

    log.info("Backup finished successfully.")


if __name__ == "__main__":
    main()
