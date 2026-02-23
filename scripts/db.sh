#!/usr/bin/env bash
set -euo pipefail

# scripts/db.sh [path|shell]
# - path: prints the DB path (or empty)
# - shell: opens sqlite3 on the DB (creates dev copy if missing)

cmd=${1:-path}

# project root is one level up from scripts/
proj_root="$(cd "$(dirname "$0")/.." && pwd)"

home=${HOME:-}

# candidate paths
mac_path="$home/Library/Application Support/2xKOKombo/app.db"
xdg_base=${XDG_DATA_HOME:-"$home/.local/share"}
xdg_path="$xdg_base/2xKOKombo/app.db"
local_path="$home/.local/share/2xKOKombo/app.db"
dev_copy="$proj_root/src-tauri/app.db"

DB=""
if [ -n "$home" ] && [ -f "$mac_path" ]; then
  DB="$mac_path"
elif [ -n "$XDG_DATA_HOME" ] && [ -f "$xdg_path" ]; then
  DB="$xdg_path"
elif [ -f "$local_path" ]; then
  DB="$local_path"
elif [ -f "$dev_copy" ]; then
  DB="$dev_copy"
fi

if [ "$cmd" = "path" ]; then
  if [ -n "$DB" ]; then
    printf "%s\n" "$DB"
  else
    exit 1
  fi
  exit 0
fi

# cmd == shell
if [ -z "$DB" ]; then
  echo "No runtime DB found; creating a dev copy at $dev_copy"
  mkdir -p "$(dirname "$dev_copy")"
  touch "$dev_copy"
  DB="$dev_copy"
fi

echo "Using DB: $DB"

if ! command -v sqlite3 >/dev/null 2>&1; then
  echo "sqlite3 not found. Install it (e.g. 'brew install sqlite' on macOS) and re-run 'make db-shell'."
  exit 1
fi

exec sqlite3 "$DB"
