#!/usr/bin/env bash
set -Eeuo pipefail

cd "$(dirname "$(realpath "$0")")"

if [[ ! -f .env.production ]]; then
  echo "Missing .env.production. Copy .env.production.example and configure it first." >&2
  exit 1
fi

compose=(docker compose --env-file .env.production -f docker-compose.prod.yml)
"${compose[@]}" config --quiet
"${compose[@]}" up -d --build --remove-orphans
"${compose[@]}" ps
