#!/usr/bin/env bash
# Uso (somente desenvolvimento): DATABASE_URL=... scripts/reset-db.sh
set -euo pipefail
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -c "drop schema public cascade; create schema public;"
npx tsx scripts/migrate.ts
