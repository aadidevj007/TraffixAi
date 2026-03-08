#!/usr/bin/env bash
set -euo pipefail

echo "Installing frontend dependencies..."
cd frontend
npm ci
npm run build
cd ..

echo "Deploying Firestore rules + Hosting..."
firebase deploy --only firestore:rules,hosting

echo "Deployment complete."

