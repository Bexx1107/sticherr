#!/bin/bash
# Stitcher Standalone Workspace — Startup Script
# Automatically installs dependencies and starts the frontend and backend servers.

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "============================================="
echo "  Sticherr Standalone Workspace"
echo "============================================="

if [ ! -d "node_modules" ]; then
  echo "⚠️  node_modules not found. Running npm install..."
  npm install
fi

echo "→ Starting Sticherr Workspace..."
echo "  - Standalone server running on http://localhost:3002"
echo "============================================="

npm run dev
