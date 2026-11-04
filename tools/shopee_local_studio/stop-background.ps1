param([int]$Port = 3777)
$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$logRoot = Join-Path $root 'data\service'
New-Item -ItemType Directory -Path $logRoot -Force | Out-Null
Set-Content -LiteralPath (Join-Path $logRoot "stop-$Port") -Value 'User requested website shutdown.'
$serverPath = Join-Path $root 'src\server.js'
$listeners = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
foreach ($listener in $listeners) {
  $candidate = Get-CimInstance Win32_Process -Filter "ProcessId=$($listener.OwningProcess)"
  if ($candidate.Name -eq 'node.exe' -and ($candidate.CommandLine.Contains($serverPath) -or $candidate.CommandLine -match '\.[\\/]src[\\/]server\.js')) {
    Stop-Process -Id $listener.OwningProcess -Force
  } else { throw "Port $Port belongs to another program; it was not stopped." }
}
Write-Output 'Website stopped. Product jobs will require manual resume after restart.'
