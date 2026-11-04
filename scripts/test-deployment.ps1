$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
$suite = Join-Path ([IO.Path]::GetTempPath()) ('studio-deploy-' + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $suite | Out-Null
$utf8 = [Text.UTF8Encoding]::new($true)
function Assert-True($Value, $Message) { if (-not $Value) { throw $Message } }
function Run-Git($Root, [string[]]$GitArgs) {
  $output = & git -C $Root @GitArgs
  if ($LASTEXITCODE -ne 0) { throw "Fixture Git failed: $($GitArgs[0])" }
  return $output
}
function New-Fixture($Name) {
  $root = Join-Path $suite $Name
  New-Item -ItemType Directory -Path $root | Out-Null
  Run-Git $root @('init','-q') | Out-Null
  Run-Git $root @('config','user.name','Deployment Fixture') | Out-Null
  Run-Git $root @('config','user.email','fixture@example.invalid') | Out-Null
  Run-Git $root @('remote','add','origin','https://github.com/Li-Junming/shopee-local-studio.git') | Out-Null
  Set-Content -LiteralPath (Join-Path $root '.gitignore') -Value ".studio*/`ntools/shopee_local_studio/data/" -Encoding ascii
  Set-Content -LiteralPath (Join-Path $root 'version.txt') -Value 'old' -Encoding ascii
  Run-Git $root @('add','.') | Out-Null
  Run-Git $root @('commit','-qm','old') | Out-Null
  $old = [string](Run-Git $root @('rev-parse','HEAD'))
  Set-Content -LiteralPath (Join-Path $root 'version.txt') -Value 'new' -Encoding ascii
  Set-Content -LiteralPath (Join-Path $root 'VERSION.json') -Value '{"version":"0.2.0","dataFormat":1}' -Encoding ascii
  Run-Git $root @('add','VERSION.json') | Out-Null
  Run-Git $root @('commit','-qam','new') | Out-Null
  Run-Git $root @('tag','v0.2.0') | Out-Null
  Run-Git $root @('checkout','--detach',$old) | Out-Null
  $runner = Join-Path $root '.studio-updates\runner'
  New-Item -ItemType Directory -Path (Join-Path $runner 'scripts') -Force | Out-Null
  Copy-Item -LiteralPath (Join-Path $repo '更新网站.ps1') -Destination (Join-Path $runner 'update.ps1')
  Copy-Item -LiteralPath (Join-Path $repo '回退网站.ps1') -Destination (Join-Path $runner 'rollback.ps1')
  $common = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'deployment.ps1') -Raw
  $mocks = @'
function Get-CimInstance { return @() }
function Invoke-RestMethod { return $null }
function Invoke-StudioGit {
  param([string[]]$Arguments)
  if ($Arguments[0] -eq 'fetch') { return }
  $output = & git -C $script:StudioRoot @Arguments
  if ($LASTEXITCODE -ne 0) { throw 'Fixture Git command failed.' }
  return $output
}
function Install-StudioDependencies {
  if ((Test-Path -LiteralPath (Join-Path $script:StudioRoot '.studio-updates\force-failure')) -and (Get-Content -LiteralPath (Join-Path $script:StudioRoot 'version.txt')).Trim() -eq 'new') { throw 'Simulated dependency failure.' }
}
function Stop-StudioForUpdate { }
function Start-StudioAfterUpdate { }
'@
  [IO.File]::WriteAllText((Join-Path $runner 'scripts\deployment.ps1'), ($common + "`r`n" + $mocks), $utf8)
  $data = Join-Path $root 'tools\shopee_local_studio\data'
  New-Item -ItemType Directory -Path (Join-Path $data 'tasks\fixture\images') -Force | Out-Null
  Set-Content -LiteralPath (Join-Path $data 'runtime-config.json') -Value '{"fixture":"local-only"}' -Encoding ascii
  Set-Content -LiteralPath (Join-Path $data 'tasks\fixture\task.json') -Value '{"status":"pipeline_done"}' -Encoding ascii
  Set-Content -LiteralPath (Join-Path $data 'tasks\fixture\images\keep.png') -Value 'image-sentinel' -Encoding ascii
  $dependencies = Join-Path $root 'tools\bigseller_draft_filler\node_modules'
  New-Item -ItemType Directory -Path $dependencies -Force | Out-Null
  Set-Content -LiteralPath (Join-Path $dependencies 'keep.txt') -Value 'dependency-sentinel' -Encoding ascii
  return @{ root=$root; runner=$runner; old=$old; data=$data }
}

# Fixtures never download packages, contact GitHub, stop processes, or bind ports.
$busy = New-Fixture 'busy'
Set-Content -LiteralPath (Join-Path $busy.data 'tasks\fixture\task.json') -Value '{"status":"pipeline_generating_images"}' -Encoding ascii
$message = ''
try { & (Join-Path $busy.runner 'update.ps1') -Version v0.2.0 -InstallRoot $busy.root } catch { $message = $_.Exception.Message }
Assert-True ($message -match 'running') 'Running task did not block update.'
Assert-True ((Run-Git $busy.root @('rev-parse','HEAD')) -eq $busy.old) 'Busy fixture HEAD changed.'
Write-Host 'PASS running tasks block update.'

$dirty = New-Fixture 'dirty'
Set-Content -LiteralPath (Join-Path $dirty.root 'version.txt') -Value 'local change'
$message = ''
try { & (Join-Path $dirty.runner 'update.ps1') -Version v0.2.0 -InstallRoot $dirty.root } catch { $message = $_.Exception.Message }
Assert-True ($message -match 'local changes') 'Local program changes were not protected.'
Write-Host 'PASS local code changes block update.'

$success = New-Fixture 'success'
& (Join-Path $success.runner 'update.ps1') -Version v0.2.0 -InstallRoot $success.root
$state = Get-Content -LiteralPath (Join-Path $success.root '.studio-updates\state.json') -Raw | ConvertFrom-Json
Assert-True ($state.status -eq 'complete') 'Update was not marked complete.'
Assert-True (Test-Path -LiteralPath (Join-Path $state.backup 'program.zip')) 'Program backup missing.'
Assert-True (Test-Path -LiteralPath (Join-Path $state.backup 'runtime-config.json')) 'Configuration backup missing.'
Assert-True ((Get-Content -LiteralPath (Join-Path $success.data 'tasks\fixture\images\keep.png')).Trim() -eq 'image-sentinel') 'Image changed during update.'
& (Join-Path $success.runner 'rollback.ps1') -InstallRoot $success.root
Assert-True ((Run-Git $success.root @('rev-parse','HEAD')) -eq $success.old) 'Manual rollback did not restore old code.'
Assert-True ((Get-Content -LiteralPath (Join-Path $success.root 'tools\bigseller_draft_filler\node_modules\keep.txt')).Trim() -eq 'dependency-sentinel') 'Dependency rollback failed.'
Write-Host 'PASS successful update, backup, data preservation and manual rollback.'

$failure = New-Fixture 'failure'
Set-Content -LiteralPath (Join-Path $failure.root '.studio-updates\force-failure') -Value 'fixture'
$message = ''
try { & (Join-Path $failure.runner 'update.ps1') -Version v0.2.0 -InstallRoot $failure.root } catch { $message = $_.Exception.Message }
Assert-True ($message -match 'previous program was restored') "Automatic rollback failed: $message"
Assert-True ((Run-Git $failure.root @('rev-parse','HEAD')) -eq $failure.old) 'Automatic rollback did not restore old code.'
Assert-True (Test-Path -LiteralPath (Join-Path $failure.data 'tasks\fixture\images\keep.png')) 'Image lost during rollback.'
Write-Host 'PASS failed dependency installation automatically restores old code.'
Write-Host "Deployment fixtures kept for inspection: $suite"
