param(
  [int]$Port = 3777,
  [string]$HostName = "127.0.0.1",
  [switch]$Restart
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path

function Import-SavedEnv {
  if (-not $env:OPENAI_API_KEY) {
    $env:OPENAI_API_KEY = [Environment]::GetEnvironmentVariable("OPENAI_API_KEY", "User")
  }
  if (-not $env:OPENAI_API_KEY) {
    $env:OPENAI_API_KEY = [Environment]::GetEnvironmentVariable("OPENAI_API_KEY", "Machine")
  }
  if (-not $env:OPENAI_BASE_URL) {
    $env:OPENAI_BASE_URL = [Environment]::GetEnvironmentVariable("OPENAI_BASE_URL", "User")
  }
  if (-not $env:OPENAI_BASE_URL) {
    $env:OPENAI_BASE_URL = [Environment]::GetEnvironmentVariable("OPENAI_BASE_URL", "Machine")
  }
}

function Stop-PortNode {
  param([int]$TargetPort)
  $pids = Get-NetTCPConnection -LocalPort $TargetPort -State Listen -ErrorAction SilentlyContinue |
    Select-Object -ExpandProperty OwningProcess -Unique
  foreach ($pidValue in $pids) {
    $process = Get-Process -Id $pidValue -ErrorAction SilentlyContinue
    if ($process -and $process.ProcessName -eq "node") {
      Stop-Process -Id $pidValue -Force
      Write-Output "Stopped old node process $pidValue on port $TargetPort"
    }
  }
}

function Wait-Health {
  param([string]$Url)
  for ($i = 0; $i -lt 20; $i++) {
    try {
      $response = Invoke-RestMethod -Uri $Url -TimeoutSec 2
      if ($response.ok) { return $true }
    }
    catch {
      Start-Sleep -Milliseconds 500
    }
  }
  return $false
}

Import-SavedEnv
if (-not $env:OPENAI_API_KEY) {
  Write-Output "OPENAI_API_KEY is not set. Open the Studio and save API config in the left panel."
}
if (-not $env:OPENAI_BASE_URL) {
  $env:OPENAI_BASE_URL = "https://api.openai.com/v1"
}

if ($Restart) {
  Stop-PortNode -TargetPort $Port
}

$existing = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
if ($existing) {
  Write-Output "Shopee Local Studio is already listening on http://${HostName}:$Port/"
  exit 0
}

$argsList = @(
  "-NoProfile",
  "-ExecutionPolicy", "Bypass",
  "-File", (Join-Path $root "run.ps1"),
  "-Port", "$Port",
  "-HostName", "$HostName"
)

$process = Start-Process -FilePath "powershell.exe" `
  -ArgumentList $argsList `
  -WorkingDirectory $root `
  -WindowStyle Hidden `
  -PassThru

$url = "http://${HostName}:$Port/api/health"
if (-not (Wait-Health -Url $url)) {
  throw "Started process $($process.Id), but health check failed at $url"
}

Write-Output "Started Shopee Local Studio PID $($process.Id)"
Write-Output "Open http://${HostName}:$Port/"
