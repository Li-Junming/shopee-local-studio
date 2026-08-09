$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$project = $root
if (Test-Path (Join-Path $root "ni\tools\shopee_local_studio")) {
  $project = Join-Path $root "ni"
}

$watermarkCandidates = @(
  $env:SHOPEE_STORE_FRAME_ROOT,
  (Join-Path $root "watermarks\越南水印储存"),
  (Join-Path (Split-Path -Parent $root) "watermarks\越南水印储存"),
  (Join-Path $env:USERPROFILE "Desktop\虾皮电商\越南水印储存")
) | Where-Object { $_ }

foreach ($candidate in $watermarkCandidates) {
  if (Test-Path -LiteralPath $candidate) {
    $resolved = (Resolve-Path -LiteralPath $candidate).Path
    [Environment]::SetEnvironmentVariable("SHOPEE_STORE_FRAME_ROOT", $resolved, "User")
    $env:SHOPEE_STORE_FRAME_ROOT = $resolved
    break
  }
}

Push-Location (Join-Path $project "tools\shopee_local_studio")
powershell -ExecutionPolicy Bypass -File .\start-background.ps1 -Restart
Pop-Location

Start-Process "http://127.0.0.1:3777"
