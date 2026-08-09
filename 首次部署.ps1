$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$project = $root
if (Test-Path (Join-Path $root "ni\tools\shopee_local_studio")) {
  $project = Join-Path $root "ni"
}

function Test-Command {
  param([string]$Name)
  return [bool](Get-Command $Name -ErrorAction SilentlyContinue)
}

function Resolve-WatermarkRoot {
  $candidates = @(
    $env:SHOPEE_STORE_FRAME_ROOT,
    (Join-Path $root "watermarks\越南水印储存"),
    (Join-Path (Split-Path -Parent $root) "watermarks\越南水印储存"),
    (Join-Path $env:USERPROFILE "Desktop\虾皮电商\越南水印储存")
  ) | Where-Object { $_ }

  foreach ($candidate in $candidates) {
    if (Test-Path -LiteralPath $candidate) {
      return (Resolve-Path -LiteralPath $candidate).Path
    }
  }
  return $null
}

Write-Host "Checking Node.js..."
if (-not (Test-Command "node")) { throw "Node.js not found. Install Node.js LTS first." }
if (-not (Test-Command "npm")) { throw "npm not found. Install Node.js LTS first." }
node -v
npm -v

Write-Host "Checking Google Chrome..."
$chromePaths = @(
  "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
  "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
  "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe"
)
if (-not ($chromePaths | Where-Object { Test-Path -LiteralPath $_ })) {
  throw "Google Chrome not found. Install Google Chrome first."
}

$watermarks = Resolve-WatermarkRoot
if ($watermarks) {
  [Environment]::SetEnvironmentVariable("SHOPEE_STORE_FRAME_ROOT", $watermarks, "User")
  $env:SHOPEE_STORE_FRAME_ROOT = $watermarks
  Write-Host "Watermark root: $watermarks"
} else {
  Write-Warning "Watermark folder not found. Put it at C:\ShopeeLocalStudio\watermarks\越南水印储存 or set SHOPEE_STORE_FRAME_ROOT."
}

Write-Host "Installing Shopee Local Studio dependencies..."
Push-Location (Join-Path $project "tools\shopee_local_studio")
npm install
Pop-Location

Write-Host "Installing BigSeller automation dependencies..."
Push-Location (Join-Path $project "tools\bigseller_draft_filler")
npm install
Pop-Location

Write-Host "Installing image generator dependencies..."
Push-Location (Join-Path $project "tools\image2_generator")
npm install
Pop-Location

Write-Host "Starting Shopee Local Studio..."
Push-Location (Join-Path $project "tools\shopee_local_studio")
powershell -ExecutionPolicy Bypass -File .\start-background.ps1 -Restart
Pop-Location

Start-Process "http://127.0.0.1:3777"
Write-Host "Open http://127.0.0.1:3777"
Write-Host "Then save API config in the left panel."
Write-Host "Next login BigSeller with:"
Write-Host "cd $project\tools\bigseller_draft_filler"
Write-Host "powershell -ExecutionPolicy Bypass -File .\run.ps1 -Login"
