param([string]$Version = '', [switch]$CheckOnly, [string]$InstallRoot = $PSScriptRoot)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'scripts\deployment.ps1')
Assert-StudioRepository
Assert-StudioIdle
if (-not $Version) {
  $Version = Get-PublishedStudioVersion
}
if ($Version -notmatch '^v\d+\.\d+\.\d+$') { throw 'Only stable release tags such as v0.2.0 are supported.' }
Invoke-StudioGit -Arguments @('fetch','origin','--tags') | Out-Null
$target = [string](Invoke-StudioGit -Arguments @('rev-parse',"refs/tags/$Version^{commit}"))
$targetVersion = (Invoke-StudioGit -Arguments @('show',"${target}:VERSION.json")) -join "`n" | ConvertFrom-Json
$installedVersionFile = Join-Path $script:StudioRoot 'VERSION.json'
$dataFormat = 1
if (Test-Path -LiteralPath $installedVersionFile) { $dataFormat = (Get-Content -LiteralPath $installedVersionFile -Raw | ConvertFrom-Json).dataFormat }
if ($targetVersion.dataFormat -ne $dataFormat) { throw 'This version requires a data migration. Automatic update was stopped before changing files.' }
$previous = [string](Invoke-StudioGit -Arguments @('rev-parse','HEAD'))
if ($target -eq $previous) { Write-Host "Already on $Version."; return }
Write-Host "Update available: $Version ($($target.Substring(0,7)))."
if ($CheckOnly) { return }
$backup = New-StudioBackup
$stateDir = Join-Path $script:StudioRoot '.studio-updates'
New-Item -ItemType Directory -Path $stateDir -Force | Out-Null
$state = @{ previousCommit=$previous; targetCommit=$target; version=$Version; backup=$backup; updatedAt=(Get-Date).ToString('o'); status='pending' }
$statePath = Join-Path $stateDir 'state.json'
$state | ConvertTo-Json | Set-Content -LiteralPath $statePath -Encoding UTF8
Stop-StudioForUpdate
try {
  Invoke-StudioGit -Arguments @('checkout','--detach',$target) | Out-Null
  Install-StudioDependencies
  Start-StudioAfterUpdate
  $state.status = 'complete'
  $state | ConvertTo-Json | Set-Content -LiteralPath $statePath -Encoding UTF8
  Write-Host "Updated to $Version. Backup: $backup"
} catch {
  $failure = $_.Exception.Message
  try {
    Stop-StudioForUpdate
    Invoke-StudioGit -Arguments @('checkout','--detach',$previous) | Out-Null
    Restore-StudioDependencies -Backup $backup
    Start-StudioAfterUpdate
    $state.status = 'rolled_back'
    $state | ConvertTo-Json | Set-Content -LiteralPath $statePath -Encoding UTF8
  } catch { throw "Update failed: $failure. Automatic rollback needs attention: $($_.Exception.Message). Backup: $backup" }
  throw "Update failed and the previous program was restored: $failure. Data and images remain in place."
}
