.PHONY: dev stop restart build preview clean install

PID_FILE := .dev.pid

dev:
	@if [ -f $(PID_FILE) ] && kill -0 $$(cat $(PID_FILE)) 2>/dev/null; then \
		echo "Dev server already running (PID $$(cat $(PID_FILE)))"; \
	else \
		nohup npm run dev -- --host --port 6173 > .dev.log 2>&1 & echo $$! > $(PID_FILE); \
		echo "Dev server started (PID $$(cat $(PID_FILE))), logs in .dev.log"; \
	fi

stop:
	@if [ -f $(PID_FILE) ] && kill -0 $$(cat $(PID_FILE)) 2>/dev/null; then \
		kill $$(cat $(PID_FILE)) && rm -f $(PID_FILE); \
		echo "Dev server stopped"; \
	else \
		echo "No dev server running"; \
		rm -f $(PID_FILE); \
	fi

restart: stop dev

build:
	npm run build

preview:
	npm run preview -- --host

clean:
	rm -rf dist .dev.log .dev.pid

install:
	npm install
