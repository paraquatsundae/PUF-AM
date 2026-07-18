# Deploy PUFOM Express+Vite app to Cloud Run (public HTTPS, no localhost).
# Prerequisites: gcloud CLI, logged in, billing enabled on the GCP project.
$ErrorActionPreference = "Stop"
Set-Location (Join-Path $PSScriptRoot "..")

$ProjectId = if ($env:GCLOUD_PROJECT) { $env:GCLOUD_PROJECT } else { "gen-lang-client-0444791425" }
$Region = if ($env:CLOUD_RUN_REGION) { $env:CLOUD_RUN_REGION } else { "australia-southeast1" }
$Service = if ($env:CLOUD_RUN_SERVICE) { $env:CLOUD_RUN_SERVICE } else { "pufom" }

$gcloudCmd = $null
if (Get-Command gcloud -ErrorAction SilentlyContinue) {
  $gcloudCmd = (Get-Command gcloud).Source
} else {
  $candidate = Join-Path $env:LOCALAPPDATA "Google\Cloud SDK\google-cloud-sdk\bin\gcloud.cmd"
  if (Test-Path $candidate) { $gcloudCmd = $candidate }
}
if (-not $gcloudCmd) {
  throw "gcloud not found. Install Google Cloud SDK (winget install Google.CloudSDK), open a new terminal, then retry."
}

if (-not (Test-Path "firebase-applet-config.json")) {
  throw "firebase-applet-config.json missing - copy from firebase-applet-config.example.json and fill values."
}

Write-Host "Project:  $ProjectId"
Write-Host "Region:   $Region"
Write-Host "Service:  $Service"
Write-Host "gcloud:   $gcloudCmd"

& $gcloudCmd config set project $ProjectId

# Enable required APIs (idempotent)
& $gcloudCmd services enable run.googleapis.com cloudbuild.googleapis.com secretmanager.googleapis.com artifactregistry.googleapis.com --quiet

# Ensure DPIRD secret exists (create from local .env once if missing)
$dpirdSecret = "DPIRD_API_KEY"
$hasSecret = $false
$prevErr = $ErrorActionPreference
$ErrorActionPreference = "Continue"
& $gcloudCmd secrets describe $dpirdSecret 2>$null | Out-Null
if ($LASTEXITCODE -eq 0) { $hasSecret = $true }
$ErrorActionPreference = $prevErr

if (-not $hasSecret) {
  if (-not (Test-Path ".env")) {
    throw "No Secret Manager secret '$dpirdSecret' and no local .env to bootstrap from."
  }
  $line = Get-Content .env | Where-Object { $_ -match '^\s*DPIRD_API_KEY\s*=' } | Select-Object -First 1
  if (-not $line) {
    throw ".env has no DPIRD_API_KEY - cannot create secret."
  }
  $value = ($line -split '=', 2)[1].Trim().Trim('"').Trim("'")
  if (-not $value -or $value -eq "YOUR_DPIRD_API_KEY") {
    throw "DPIRD_API_KEY in .env is empty/placeholder."
  }
  $value | & $gcloudCmd secrets create $dpirdSecret --data-file=-
  if ($LASTEXITCODE -ne 0) { throw "Failed to create secret $dpirdSecret" }
  Write-Host "Created Secret Manager secret $dpirdSecret"
}

# Grant Cloud Run runtime SA access to the secret
$projectNumber = & $gcloudCmd projects describe $ProjectId --format="value(projectNumber)"
$runtimeSa = "$projectNumber-compute@developer.gserviceaccount.com"
& $gcloudCmd secrets add-iam-policy-binding $dpirdSecret `
  --member="serviceAccount:$runtimeSa" `
  --role="roles/secretmanager.secretAccessor" `
  --quiet | Out-Null

$firestoreDb = "ai-studio-143a17d7-b431-4490-8302-3a5ff176bb96"
if (Test-Path "firebase-applet-config.json") {
  try {
    $cfg = Get-Content "firebase-applet-config.json" -Raw | ConvertFrom-Json
    if ($cfg.firestoreDatabaseId) { $firestoreDb = [string]$cfg.firestoreDatabaseId }
  } catch {
    Write-Warning "Could not parse firebase-applet-config.json for firestoreDatabaseId"
  }
}

Write-Host "Building and deploying (Cloud Build + Cloud Run)..."
& $gcloudCmd run deploy $Service `
  --source . `
  --region $Region `
  --platform managed `
  --allow-unauthenticated `
  --port 8080 `
  --memory 1Gi `
  --cpu 1 `
  --min-instances 0 `
  --max-instances 3 `
  --set-env-vars "NODE_ENV=production,FIREBASE_PROJECT_ID=$ProjectId,FIRESTORE_DATABASE_ID=$firestoreDb" `
  --set-secrets "DPIRD_API_KEY=DPIRD_API_KEY:latest"

if ($LASTEXITCODE -ne 0) { throw "Cloud Run deploy failed (exit $LASTEXITCODE)" }

$url = & $gcloudCmd run services describe $Service --region $Region --format="value(status.url)"
Write-Host ""
Write-Host "Deployed: $url"
Write-Host "Health:   $url/api/health"
Write-Host ""
Write-Host "Next:"
Write-Host "  1. Set APP_URL and VITE_APP_URL in .env to $url (then rebuild Android if needed)"
Write-Host "  2. Add Maps HTTP referrer: $url/*"
Write-Host "  3. Grant the Cloud Run SA Firebase Admin if invite PIN fails (roles/firebase.admin or datastore user)"
Write-Host "  4. Point Capacitor: CAP_PACKAGED=1 with VITE_API_BASE_URL=$url"
