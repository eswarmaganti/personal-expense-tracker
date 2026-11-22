# Google Drive Backup — Setup Guide

Runs daily at 20:00 (8 PM) and uploads a timestamped copy of `expense.db` to a
designated Google Drive folder, keeping the 30 most recent backups.

---

## 1 — Create a Google Cloud project

1. Go to <https://console.cloud.google.com> and create a new project (e.g. `expense-tracker-backup`).
2. Navigate to **APIs & Services → Library**, search for **Google Drive API**, and click **Enable**.
3. Navigate to **APIs & Services → OAuth consent screen**:
   - Choose **External** (or Internal if you have a Workspace account).
   - Fill in app name (e.g. `Expense Backup`) and your email.
   - Add scope: `https://www.googleapis.com/auth/drive.file`
     *(this scope only allows access to files the app itself creates — it cannot read the rest of your Drive).*
   - Add your Google account as a **Test user**.
4. Navigate to **APIs & Services → Credentials → Create Credentials → OAuth client ID**:
   - Application type: **Desktop app**.
   - Download the JSON → save it as `scripts/credentials.json` in this project.

---

## 2 — Share a Drive folder

1. Create a folder in Google Drive (e.g. `ExpenseTrackerBackups`).
2. The folder does **not** need to be shared with anyone — it stays private to your account.
3. Open the folder → copy its **ID** from the URL:
   ```
   https://drive.google.com/drive/folders/<FOLDER_ID>
   ```

---

## 3 — Install dependencies

```bash
pip3 install -r scripts/requirements.txt
```

---

## 4 — First run (one-time OAuth consent)

```bash
export GDRIVE_FOLDER_ID=<your_folder_id>
python3 scripts/backup_to_drive.py
```

A browser window will open asking you to authorise the app. After approval, a
`scripts/token.json` file is written. All future runs use this token silently
(it auto-refreshes). **Never commit `token.json` or `credentials.json` to git.**

---

## 5 — Schedule with cron (daily at 8 PM)

```bash
crontab -e
```

Add this line (adjust paths to match your setup):

```cron
0 20 * * * GDRIVE_FOLDER_ID=<your_folder_id> /usr/bin/python3 /path/to/personal-expense-tracker/scripts/backup_to_drive.py >> /path/to/personal-expense-tracker/scripts/backup.log 2>&1
```

Verify the cron was saved:
```bash
crontab -l
```

---

## Environment variables

| Variable | Default | Description |
|---|---|---|
| `GDRIVE_FOLDER_ID` | *(required)* | Google Drive folder ID |
| `DB_PATH` | `../backend/expense.db` | Path to the SQLite database |
| `GDRIVE_CREDENTIALS_FILE` | `scripts/credentials.json` | OAuth2 client secrets file |
| `GDRIVE_TOKEN_FILE` | `scripts/token.json` | Cached OAuth2 token (auto-created) |
| `KEEP_BACKUPS` | `30` | Number of backups to retain in Drive |
| `LOG_FILE` | `scripts/backup.log` | Log output path |

---

## Files to add to `.gitignore`

```
scripts/credentials.json
scripts/token.json
scripts/backup.log
scripts/*.db
```
