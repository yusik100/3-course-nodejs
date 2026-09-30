# Task Tracker API — базові команди розробки (GNU Make)
#
# Швидкий старт:
#   make install
#   make lint
#   make format

.DEFAULT_GOAL := help

.PHONY: help install build smoke typecheck lint lint-fix format format-check

help:
	@echo Task Tracker API - доступні цілі:
	@echo   make install       - встановити залежності (npm install)
	@echo   make build         - зібрати проєкт у dist/ (tsc)
	@echo   make smoke         - мінімальний smoke-тест (npm run smoke)
	@echo   make lint          - перевірити код ESLint
	@echo   make lint-fix      - ESLint з автовиправленням (--fix)
	@echo   make format        - відформатувати код Prettier (--write)
	@echo   make format-check  - перевірити форматування, не змінюючи файли
	@echo   make typecheck     - перевірити типи TypeScript (tsc --noEmit)

## Встановити залежності (ініціалізує husky через prepare-скрипт)
install:
	npm install

## Скомпілювати проєкт у dist/ (продакшн-збірка)
build:
	npm run build

## Прогнати мінімальний smoke-тест (GET /health через app.inject)
smoke:
	npm run smoke

## Перевірити код ESLint (без змін у файлах)
lint:
	npm run lint

## Перевірити код ESLint та автоматично виправити те, що можливо
lint-fix:
	npm run lint:fix

## Відформатувати файли проєкту Prettier
format:
	npm run format

## Перевірити форматування, не змінюючи файли
format-check:
	npm run format:check

## Перевірити типи TypeScript
typecheck:
	npm run typecheck
