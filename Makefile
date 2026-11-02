.PHONY: verify up down

verify:
	npm run lint
	npm run typecheck
	npm test

up:
	docker compose up -d

down:
	docker compose down -v
