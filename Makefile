# Makefile for common tasks in the Tauri + React + Tailwind project

.PHONY: frontend-install frontend-dev tauri-dev dev build test-db

.PHONY: db-path db-shell

frontend-install:
	cd frontend && npm install

frontend-dev:
	cd frontend && npm run dev

tauri-dev:
	cargo tauri dev

dev:
	@echo "Starting frontend dev server and Tauri backend..."
	@echo "Launching frontend (Vite) in background..."; \
	# start frontend dev server via npm --prefix so it works regardless of cwd
	npm --prefix frontend run dev > /tmp/2xkokombo-frontend.log 2>&1 & \
	FRONTEND_PID=$$!; \
	echo "frontend pid $$FRONTEND_PID"; \
	# wait for frontend to respond on default Vite port
	for i in 1 2 3 4 5 6 7 8 9 10; do \
	  if curl --silent --head http://localhost:5173 >/dev/null 2>&1; then \
	    echo "frontend ready"; break; \
	  else \
	    echo "waiting for frontend to start (attempt $$i/10)..."; sleep 1; \
	  fi; \
	done; \
	# start tauri which will connect to the running dev server
	echo "Starting Tauri..."; \
	cd src-tauri && cargo tauri dev

build:
	cd frontend && npm run build
	cargo tauri build

test-db:
	# run Rust unit tests in src-tauri which include an in-memory SQLite test
	cd src-tauri && cargo test

# Print the path to the application's SQLite database used at runtime.
db-path:
	@echo "Detecting app DB path..."
	@./scripts/db.sh path || echo "No DB file found (looked in app data and src-tauri)."

# Open the app SQLite DB in `sqlite3` for quick inspection.
# Falls back to a local dev copy under `src-tauri/app.db` if the runtime DB isn't present.
db-shell:
	@./scripts/db.sh shell
