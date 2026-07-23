#!/bin/bash
# Loads .env safely (values may contain special shell chars) and runs the server.
set -euo pipefail
cd "$(dirname "$0")"
set -a
# shellcheck disable=SC1091
source .env
set +a
go run ./cmd/cvserver
