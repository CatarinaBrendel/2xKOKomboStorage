Tauri + React + Tailwind + SQLite

Prerequisites:
- Node 18+ and npm
- Rust and cargo (install via rustup)
- On macOS: install required system deps for Tauri (see Tauri docs)

Quick start (development):

```bash
# 1) Install frontend deps and start Vite dev server
cd frontend
npm install
npm run dev

# 2) In another terminal, run the Tauri dev server from project root
# (this will use the Vite dev server at http://localhost:5173)
cd "$(dirname "$PWD")"
cd /Users/catarinabrendel/Documents/Coding\ Projects/2xKOKombo
cargo install tauri-cli || true
cargo tauri dev
```

Notes:
- The Tauri config is in `src-tauri/tauri.conf.json` and expects the frontend dev server at port 5173.
- The Rust backend uses `rusqlite` and creates `app.db` in the current working directory.
- Frontend example calls the backend commands: `init_db`, `add_item`, `list_items` using `@tauri-apps/api`.
