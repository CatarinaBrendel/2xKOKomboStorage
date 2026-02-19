# Makefile for common tasks in the Tauri + React + Tailwind project

.PHONY: frontend-install frontend-dev tauri-dev dev build test-db

frontend-install:
	cd frontend && npm install

frontend-dev:
	cd frontend && npm run dev

tauri-dev:
	cargo tauri dev

dev:
	@echo "Starting frontend dev server in background..."
	$(MAKE) frontend-dev & sleep 1; $(MAKE) tauri-dev

build:
	cd frontend && npm run build
	cargo tauri build

test-db:
	# run Rust unit tests in src-tauri which include an in-memory SQLite test
	cd src-tauri && cargo test
