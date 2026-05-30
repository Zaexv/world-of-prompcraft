#!/usr/bin/env bash
set -e

# Start Vite dev server in background
npm run dev &
DEV_PID=$!

# Wait for server to be ready (simple retry on localhost:5173)
echo "Waiting for dev server to be reachable..."
until curl -s http://127.0.0.1:5173 > /dev/null; do
  sleep 2
done

echo "Dev server is up. Running Playwright E2E tests."
# Run Playwright tests (assumes @playwright/test is installed)
npx playwright test

echo "Tests completed. Shutting down dev server."
kill $DEV_PID
