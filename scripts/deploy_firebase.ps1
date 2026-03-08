$ErrorActionPreference = "Stop"

Write-Host "Installing frontend dependencies..."
Push-Location frontend
npm ci
npm run build
Pop-Location

Write-Host "Deploying Firestore rules + Hosting..."
firebase deploy --only firestore:rules,hosting

Write-Host "Deployment complete."

