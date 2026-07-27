# Measure message API latency (POST batch / GET list / DELETE).
#
# Usage:
#   npm run measure:latency
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts/measure-api-latency.ps1 -Runs 5
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts/measure-api-latency.ps1 -BaseUrl http://localhost:3001
#
# Note: on Windows, `npm run measure:latency -- -Runs 5` may not forward -Runs correctly;
#       pass parameters via direct powershell invocation instead.
#
# Before comparing Neon vs local Docker:
#   1. Set DATABASE_URL in .env (not tracked by git)
#   2. Restart `npm run dev`
#   3. For local DB: `npm run db:up` and `npx prisma migrate deploy`
#   4. Run this script; warm-up avoids first-hit Next.js route compile in dev

param(
  [string]$BaseUrl = "http://localhost:3000",
  [int]$Runs = 3
)

$ErrorActionPreference = "Stop"

$ProjectRoot = Split-Path -Parent $PSScriptRoot

function Get-DatabaseProfile {
  $envPath = Join-Path $ProjectRoot ".env"
  if (-not (Test-Path $envPath)) {
    return [pscustomobject]@{
      Label = "UNKNOWN | .env not found"
      Host = "-"
    }
  }

  $activeLine = Get-Content $envPath -Encoding UTF8 |
    Where-Object { $_ -match '^\s*DATABASE_URL\s*=' -and $_ -notmatch '^\s*#' } |
    Select-Object -First 1

  if (-not $activeLine) {
    return [pscustomobject]@{
      Label = "UNKNOWN | no active DATABASE_URL in .env"
      Host = "-"
    }
  }

  $url = ($activeLine -replace '^\s*DATABASE_URL\s*=\s*', '').Trim().Trim('"').Trim("'")
  $hostPart = $url

  if ($url -match '@([^/:?]+)') {
    $hostPart = $Matches[1]
  }

  $hostLower = $hostPart.ToLowerInvariant()
  $label = "CLOUD | remote ($hostPart)"

  if ($hostLower -eq "localhost" -or $hostLower -eq "127.0.0.1" -or $hostLower -eq "::1") {
    $label = "LOCAL | Docker ($hostPart)"
  } elseif ($hostLower -match 'neon\.tech' -or $hostLower -match '\.neon\.') {
    $label = "CLOUD | Neon ($hostPart)"
  }

  return [pscustomobject]@{
    Label = $label
    Host = $hostPart
  }
}

function Write-Step($msg) {
  Write-Host ""
  Write-Host "=== $msg ===" -ForegroundColor Cyan
}

function Invoke-Api {
  param(
    [string]$Method,
    [string]$Uri,
    [string]$Body
  )

  if ($Body) {
    return Invoke-RestMethod -Method $Method -Uri $Uri -ContentType "application/json" -Body $Body
  }

  return Invoke-RestMethod -Method $Method -Uri $Uri
}

Write-Step "Config"
if ($BaseUrl -notmatch '^https?://') {
  throw "Invalid BaseUrl '$BaseUrl'. Use: npm run measure:latency  OR  powershell -File scripts/measure-api-latency.ps1 -Runs 5"
}

$db = Get-DatabaseProfile
$runAt = Get-Date -Format "yyyy-MM-dd HH:mm:ss"

Write-Host "RunAt:    $runAt"
Write-Host "BaseUrl:  $BaseUrl"
Write-Host "Runs:     $Runs"
Write-Host "Database: $($db.Label)" -ForegroundColor Yellow
Write-Host "          (LOCAL = local Docker, CLOUD = Neon or remote host)"
Write-Host ""
Write-Host "Note: reads DATABASE_URL from .env; restart npm run dev after switching DB."

Write-Step "Warm up (skip dev first-compile noise)"
Invoke-Api -Method Get -Uri "$BaseUrl/api/conversations" | Out-Null

$warmConv = Invoke-Api -Method Post -Uri "$BaseUrl/api/conversations" -Body "{}"
$warmId = $warmConv.data.id

$warmBody = '{"messages":[{"role":"user","content":"warm"},{"role":"assistant","content":"ok"}]}'
$warmPost = Invoke-Api -Method Post -Uri "$BaseUrl/api/conversations/$warmId/messages" -Body $warmBody
$warmMid = $warmPost.data.items[0].id

Invoke-Api -Method Get -Uri "$BaseUrl/api/conversations/$warmId/messages" | Out-Null
Invoke-Api -Method Delete -Uri "$BaseUrl/api/conversations/$warmId/messages/$warmMid" | Out-Null
Invoke-Api -Method Delete -Uri "$BaseUrl/api/conversations/$warmId" | Out-Null
Write-Host "Warm up done."

Write-Step "Measure ($Runs runs) — Database: $($db.Label)"
$postMs = @()
$getMs = @()
$deleteMs = @()

for ($run = 1; $run -le $Runs; $run++) {
  $tc = Measure-Command {
    $script:conv = Invoke-Api -Method Post -Uri "$BaseUrl/api/conversations" -Body "{}"
  }
  $cid = $conv.data.id

  $body = '{"messages":[{"role":"user","content":"latency test"},{"role":"assistant","content":"ok"}]}'
  $tp = Measure-Command {
    $script:created = Invoke-Api -Method Post -Uri "$BaseUrl/api/conversations/$cid/messages" -Body $body
  }
  $mid = $created.data.items[0].id

  $tg = Measure-Command {
    Invoke-Api -Method Get -Uri "$BaseUrl/api/conversations/$cid/messages" | Out-Null
  }

  $td = Measure-Command {
    Invoke-Api -Method Delete -Uri "$BaseUrl/api/conversations/$cid/messages/$mid" | Out-Null
  }

  Invoke-Api -Method Delete -Uri "$BaseUrl/api/conversations/$cid" | Out-Null

  $post = [int]$tp.TotalMilliseconds
  $get = [int]$tg.TotalMilliseconds
  $del = [int]$td.TotalMilliseconds
  $postMs += $post
  $getMs += $get
  $deleteMs += $del

  Write-Host ("run {0}: POST {1} ms | GET {2} ms | DELETE {3} ms" -f $run, $post, $get, $del)
}

if ($Runs -gt 0) {
  Write-Step "Summary (approx)"
  Write-Host "Database: $($db.Label)"
  Write-Host ("POST   avg ~{0} ms" -f [int](($postMs | Measure-Object -Average).Average))
  Write-Host ("GET    avg ~{0} ms" -f [int](($getMs | Measure-Object -Average).Average))
  Write-Host ("DELETE avg ~{0} ms" -f [int](($deleteMs | Measure-Object -Average).Average))
  Write-Host ""
  Write-Host "Tip: compare dev server logs for DB-only time (application-code)."
}
