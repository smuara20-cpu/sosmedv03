#!/usr/bin/env sh
cd "$(dirname "$0")/.." || exit 1
command -v node >/dev/null || { echo "Node.js belum terpasang (butuh 22.13+)"; exit 1; }
[ -d node_modules ] || npm install
[ -f .env ] && { set -a; . ./.env; set +a; }
npm start
