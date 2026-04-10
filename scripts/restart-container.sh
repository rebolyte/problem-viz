#!/bin/bash
set -euo pipefail

# To be run on server. Run from directory containing docker-compose.yml, or set COMPOSE_DIR.

COMPOSE_DIR="${COMPOSE_DIR:-.}"
SERVICE_NAME="${SERVICE_NAME:-teddygram}"
DATA_DIR=~/teddygram-data

mkdir -p "$DATA_DIR"

if [[ ! -f "$DATA_DIR/.env" ]]; then
    echo "Error: .env file not found at $DATA_DIR/.env"
    echo "Create it with production values (see .env.example)"
    exit 1
fi

cd "$COMPOSE_DIR"
docker compose pull "$SERVICE_NAME"
docker compose up -d "$SERVICE_NAME"

echo "Container started"
