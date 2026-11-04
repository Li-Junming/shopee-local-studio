param(
  [int]$Port = 3777,
  [string]$HostName = "127.0.0.1",
  [string]$NodePath = ""
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
. (Join-Path (Split-Path -Parent $root) "node-runtime.ps1")
$nodeExecutable = Resolve-StudioNode -NodePath $NodePath
Set-StudioNodeEnvironment -NodePath $nodeExecutable
Push-Location $root
$supervisor = New-Object System.Threading.Mutex($false, "Local\ShopeeLocalStudio-$Port")
$ownsSupervisor = $false
try {
  try { $ownsSupervisor = $supervisor.WaitOne(0) } catch [System.Threading.AbandonedMutexException] { $ownsSupervisor = $true }
  if (-not $ownsSupervisor) { return }
  $env:PORT = "$Port"
  $env:HOST = "$HostName"
  $logRoot = Join-Path $root 'data\service'
  New-Item -ItemType Directory -Path $logRoot -Force | Out-Null
  $stopFile = Join-Path $logRoot "stop-$Port"
  $serverLog = Join-Path $logRoot "server-$Port.log"
  $supervisorLog = Join-Path $logRoot "supervisor-$Port.log"
  $failures = 0
  while (-not (Test-Path -LiteralPath $stopFile)) {
    $started = Get-Date
    Add-Content -LiteralPath $supervisorLog -Value "$($started.ToString('o')) Starting website. Interrupted product jobs require manual resume."
    # Keep native stderr in the log without allowing PowerShell's error preference
    # to terminate the supervisor when Node reports an exception.
    $ErrorActionPreference = 'Continue'
    & $nodeExecutable .\src\server.js >> $serverLog 2>> (Join-Path $logRoot "server-$Port.error.log")
    $exitCode = $LASTEXITCODE
    $ErrorActionPreference = 'Stop'
    if (Test-Path -LiteralPath $stopFile) { break }
    if (((Get-Date) - $started).TotalSeconds -ge 60) { $failures = 0 }
    $delay = [int][Math]::Min(30, [Math]::Pow(2, [Math]::Min($failures + 1, 5)))
    $failures++
    Add-Content -LiteralPath $supervisorLog -Value "$((Get-Date).ToString('o')) Website exited ($exitCode); restart in ${delay}s."
    for ($i = 0; $i -lt $delay -and -not (Test-Path -LiteralPath $stopFile); $i++) { Start-Sleep -Seconds 1 }
  }
}
finally {
  if ($ownsSupervisor) { $supervisor.ReleaseMutex() }
  $supervisor.Dispose()
  Pop-Location
}
