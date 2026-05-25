.PHONY: bootstrap dev down test lint typecheck contract-test clean generate-types generate-types-py generate-types-ts agent agent-bridge agent-rss agent-onboard agent-eval agent-perf agent-injection-test

# ── 一键启动 ──────────────────────────────

bootstrap:
	@echo "=== Studio Javis: 环境初始化 ==="
	pnpm install
	uv sync --all-packages
	cp -n .env.example .env.local || true
	docker compose -f infra/compose/docker-compose.yml up -d postgres redis
	sleep 3
	uv run alembic -c alembic.ini upgrade head
	uv run python infra/scripts/seed_dev_data.py 2>/dev/null || true
	@echo "=== 完成。运行 make dev 启动全栈 ==="

dev:
	docker compose -f infra/compose/docker-compose.yml up

# ── Agent (OpenClaw) ──────────────────────

agent:
	cd services/agent && OPENCLAW_CONFIG_PATH=./openclaw.json pnpm openclaw gateway --port 18789 --verbose

agent-bridge:
	cd services/agent && node bridge/server.js

agent-rss:
	cd services/agent && node bridge/rss-fetcher.js

agent-eval:
	cd services/agent && node bridge/eval-runner.js --verbose

agent-perf:
	echo "perf-baseline removed — use tests/C/perf/ instead"

agent-injection-test:
	node tests/B/injection-test.js

agent-onboard:
	cd services/agent && pnpm openclaw onboard

down:
	docker compose -f infra/compose/docker-compose.yml down

# ── 测试 ──────────────────────────────────

test:
	pnpm -r test
	uv run pytest -m unit

test-integration:
	uv run pytest -m integration

test-e2e:
	pnpm --filter web e2e

contract-test:
	docker compose -f infra/compose/docker-compose.test.yml up -d
	uv run schemathesis run packages/contracts/openapi.yaml --base-url http://localhost:8080
	docker compose -f infra/compose/docker-compose.test.yml down

# ── 代码质量 ──────────────────────────────

lint:
	uv run ruff check services packages
	pnpm -r lint
	docker run --rm -v $(PWD):/spec:ro stoplight/spectral lint packages/contracts/openapi.yaml

typecheck:
	uv run mypy services/api-gateway/app packages || true
	uv run mypy services/perception/app || true
	pnpm -r typecheck

# ── 清理 ──────────────────────────────────

clean:
	docker compose -f infra/compose/docker-compose.yml down -v
	rm -rf node_modules/ .venv/ **/.pytest_cache/ **/__pycache__/ pgdata/
	pnpm store prune

# ── DB ────────────────────────────────────

db-migrate:
	uv run alembic -c alembic.ini upgrade head

db-rollback:
	uv run alembic -c alembic.ini downgrade -1

db-new-migration:
	uv run alembic -c alembic.ini revision --autogenerate -m "$(m)"

# ── 类型生成 ─────────────────────────────

generate-types: generate-types-py generate-types-ts
	@echo "=== 类型生成完成 ==="

generate-types-py:
	@echo "=== 生成 Python pydantic 模型 ==="
	uv run datamodel-codegen \
		--input packages/contracts/openapi.yaml \
		--input-file-type openapi \
		--output packages/contracts/python/models.py \
		--output-model-type pydantic_v2.BaseModel \
		--target-python-version 3.12 \
		--use-standard-collections \
		--use-union-operator \
		--field-constraints \
		--snake-case-field \
		--strict-nullable
	@echo "  -> packages/contracts/python/models.py"

generate-types-ts:
	@echo "=== 生成 TypeScript 类型 ==="
	npx openapi-typescript \
		packages/contracts/openapi.yaml \
		-o packages/contracts/ts/api.d.ts
	@echo "  -> packages/contracts/ts/api.d.ts"

# ── OpenAPI 校验 ─────────────────────────

openapi-lint:
	docker run --rm -v $(PWD):/spec:ro stoplight/spectral lint packages/contracts/openapi.yaml

openapi-diff:
	docker run --rm -v $(PWD):/spec:ro tufin/oasdiff breaking packages/contracts/openapi.yaml /spec/packages/contracts/openapi.yaml
