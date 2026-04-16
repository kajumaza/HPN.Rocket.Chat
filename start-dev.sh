#!/bin/bash
# HPN Development Startup Script
# Run this from WSL2 inside the HPN.Rocket.Chat directory

set -e

echo "=====> Starting HPN infrastructure (MongoDB + NATS)..."
docker compose -f docker-compose.dev.yml up -d

echo "=====> Waiting for MongoDB to be ready..."
sleep 5

echo "=====> Installing dependencies (first run only)..."
yarn install

echo "=====> Starting HPN app from source..."
cd apps/meteor
export $(cat .env | grep -v '^#' | xargs)
meteor run --port 3000

# App will be available at http://localhost:3000
