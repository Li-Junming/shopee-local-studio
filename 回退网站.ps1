param([string]$InstallRoot = $PSScriptRoot)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'scripts\deployment.ps1')
Assert-StudioRepository
Assert-StudioIdle
$statePath = Join-Path $script:StudioRoot '.studio-updates\state.json'
if (-not (Test-Path -LiteralPath $statePath)) { throw 'No update backup is recorded on this computer.' }
$state = Get-Content -LiteralPath $statePath -Raw | ConvertFrom-Json
if ($state.status -eq 'rolled_back') { throw 'This update has already been rolled back.' }
if ($state.previousCommit -notmatch '^[0-9a-f]{40}$') { throw 'Invalid rollback commit.' }
$current = [string](Invoke-StudioGit -Arguments @('rev-parse','HEAD'))
if ($current -ne $state.targetCommit) { throw 'The current version differs from the recorded update. Resolve it before rolling back.' }
Stop-StudioForUpdate
Invoke-StudioGit -Arguments @('checkout','--detach',$state.previousCommit) | Out-Null
Restore-StudioDependencies -Backup $state.backup
Start-StudioAfterUpdate
$state.status = 'rolled_back'
$state | ConvertTo-Json | Set-Content -LiteralPath $statePath -Encoding UTF8
Write-Host 'Previous program restored. Current tasks, images, login and API settings were retained.'
