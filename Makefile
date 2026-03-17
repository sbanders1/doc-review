.PHONY: dev stop restart build preview clean install

PORT := 6173

dev:
	@if lsof -i :$(PORT) -sTCP:LISTEN >/dev/null 2>&1; then \
		echo "Dev server already running on port $(PORT)"; \
	else \
		nohup pnpm dev --host --port $(PORT) > .dev.log 2>&1 & \
		echo "Dev server started on port $(PORT), logs in .dev.log"; \
	fi

stop:
	@if lsof -i :$(PORT) -sTCP:LISTEN >/dev/null 2>&1; then \
		lsof -ti :$(PORT) | xargs kill; \
		echo "Dev server stopped"; \
	else \
		echo "No dev server running on port $(PORT)"; \
	fi

restart: stop dev

build:
	pnpm build

preview:
	pnpm preview --host

clean:
	rm -rf dist .dev.log

install:
	pnpm install
