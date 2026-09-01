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

# Ensure enrollment-codes secret exists (create from secrets/enrollment-codes.json once if missing).
# This is the gate on POST /api/auth/create-farm (Plans/FIREBASE_BILLING.md §5.1) — the
# server fails closed without it, so a deploy that forgets this turns farm creation off,
# which is the safe direction but worth knowing.
$enrollSecret = "PUF_ENROLLMENT_CODES"
$hasEnroll = $false
$prevErr = $ErrorActionPreference
$ErrorActionPreference = "Continue"
& $gcloudCmd secrets describe $enrollSecret 2>$null | Out-Null
if ($LASTEXITCODE -eq 0) { $hasEnroll = $true }
$ErrorActionPreference = $prevErr

if (-not $hasEnroll) {
  $enrollFile = "secrets/enrollment-codes.json"
  if (-not (Test-Path $enrollFile)) {
    throw "No Secret Manager secret '$enrollSecret' and no $enrollFile to bootstrap from."
  }
  $codes = (Get-Content $enrollFile -Raw | ConvertFrom-Json).codes -join ","
  if (-not $codes) { throw "$enrollFile has no codes." }
  $codes | & $gcloudCmd secrets create $enrollSecret --data-file=-
  if ($LASTEXITCODE -ne 0) { throw "Failed to create secret $enrollSecret" }
  Write-Host "Created Secret Manager secret $enrollSecret"
}

# Grant Cloud Run runtime SA access to the secrets
$projectNumber = & $gcloudCmd projects describe $ProjectId --format="value(projectNumber)"
$runtimeSa = "$projectNumber-compute@developer.gserviceaccount.com"
& $gcloudCmd secrets add-iam-policy-binding $dpirdSecret `
  --member="serviceAccount:$runtimeSa" `
  --role="roles/secretmanager.secretAccessor" `
  --quiet | Out-Null
& $gcloudCmd secrets add-iam-policy-binding $enrollSecret `
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

# Canonical production hostname (custom domain). Fallback run.app still works.
$AppUrl = if ($env:APP_URL) { $env:APP_URL.Trim().Trim('"').Trim("'") } else { "https://am.pufworks.farm" }
if (Test-Path ".env") {
  $appLine = Get-Content .env | Where-Object { $_ -match '^\s*APP_URL\s*=' } | Select-Object -First 1
  if ($appLine) {
    $fromEnv = ($appLine -split '=', 2)[1].Trim().Trim('"').Trim("'")
    if ($fromEnv -and $fromEnv -notmatch 'localhost') { $AppUrl = $fromEnv }
  }
}

# Vite bakes VITE_* at image build time; .env is in .gcloudignore so pass build env explicitly.
# No map key here any more: satellite imagery goes through /api/tiles on the
# server, so nothing map-related needs to reach the browser. See
# Plans/API_KEY_SECURITY.md.
$viteAppUrl = $AppUrl
if (Test-Path ".env") {
  $viteLine = Get-Content .env | Where-Object { $_ -match '^\s*VITE_APP_URL\s*=' } | Select-Object -First 1
  if ($viteLine) {
    $fromVite = ($viteLine -split '=', 2)[1].Trim().Trim('"').Trim("'")
    if ($fromVite -and $fromVite -notmatch 'localhost') { $viteAppUrl = $fromVite }
  }
}

$buildEnv = "VITE_APP_URL=$viteAppUrl,VITE_MIST_EXPERIMENTAL=true"

Write-Host "APP_URL:  $AppUrl"
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
  --set-build-env-vars $buildEnv `
  --set-env-vars "NODE_ENV=production,FIREBASE_PROJECT_ID=$ProjectId,FIRESTORE_DATABASE_ID=$firestoreDb,APP_URL=$AppUrl,MIST_FREENET_DISABLED=1" `
  --set-secrets "DPIRD_API_KEY=DPIRD_API_KEY:latest,PUF_ENROLLMENT_CODES=PUF_ENROLLMENT_CODES:latest"

if ($LASTEXITCODE -ne 0) { throw "Cloud Run deploy failed (exit $LASTEXITCODE)" }

$url = & $gcloudCmd run services describe $Service --region $Region --format="value(status.url)"
Write-Host ""
Write-Host "Deployed: $url"
Write-Host "Canonical: $AppUrl"
Write-Host "Health:   $AppUrl/api/health (or $url/api/health)"
Write-Host ""
Write-Host "Next:"
Write-Host "  1. Domain map + DNS: see Plans/DEPLOY_CLOUD_RUN.md (am.pufworks.farm)"
Write-Host "  2. Firebase Auth authorized domain: am.pufworks.farm"
Write-Host "  3. Maps HTTP referrer: https://am.pufworks.farm/* (keep $url/* as fallback)"
Write-Host "  4. Grant the Cloud Run SA Firebase Admin if invite PIN fails"
Write-Host "  5. Capacitor: CAP_PACKAGED=1 with VITE_API_BASE_URL=$AppUrl"
