$script:StudioRoot = if ($InstallRoot) { (Resolve-Path -LiteralPath $InstallRoot).Path } else { Split-Path -Parent $PSScriptRoot }
$script:StudioTool = Join-Path $script:StudioRoot 'tools\shopee_local_studio'

function Get-PublishedStudioVersion {
  param([string]$LatestUrl = 'https://github.com/Li-Junming/shopee-local-studio/releases/latest')
  $response = Invoke-WebRequest -Uri $LatestUrl -Method Head -UseBasicParsing -TimeoutSec 30
  $uri = $response.BaseResponse.ResponseUri
  if (-not $uri) { $uri = $response.BaseResponse.RequestMessage.RequestUri }
  if ([string]$uri -notmatch '/releases/tag/(v\d+\.\d+\.\d+)/?$') { throw 'Could not resolve the latest published release. Specify -Version vX.Y.Z explicitly.' }
  return $Matches[1]
}

function Get-StudioNodeMajor {
  param([Parameter(Mandatory=$true)][string]$NodePath)
  # Native --version needs no embedded JavaScript quotes on Windows PowerShell 5.1.
  $version = [string]((& $NodePath --version) | Select-Object -Last 1)
  if ($LASTEXITCODE -ne 0 -or $version.Trim() -notmatch '^v?(\d+)\.') { throw 'Could not read the Node.js version.' }
  return [int]$Matches[1]
}

function Invoke-StudioGit {
  param([string[]]$Arguments)
  $result = & git -C $script:StudioRoot @Arguments
  if ($LASTEXITCODE -ne 0) { throw "Git failed: $($Arguments[0]). No force/reset/clean was performed." }
  return $result
}

function Assert-StudioRepository {
  if (-not (Test-Path -LiteralPath (Join-Path $script:StudioRoot '.git'))) { throw 'This is a ZIP copy. Clone the GitHub repository to use automatic updates. Keep existing data and watermarks.' }
  $origin = [string](Invoke-StudioGit -Arguments @('remote', 'get-url', 'origin'))
  if ($origin.TrimEnd('/') -notin @('https://github.com/Li-Junming/shopee-local-studio.git','https://github.com/Li-Junming/shopee-local-studio','git@github.com:Li-Junming/shopee-local-studio.git')) { throw 'Origin is not the expected Shopee Local Studio repository.' }
  $dirty = Invoke-StudioGit -Arguments @('status','--porcelain','--untracked-files=no')
  if ($dirty) { throw 'Program files have local changes. Back them up or commit them before updating. They will not be overwritten.' }
}

function Assert-StudioIdle {
  $dataRoot = Join-Path $script:StudioTool 'data'
  if ($env:STUDIO_DATA_ROOT) { $dataRoot = $env:STUDIO_DATA_ROOT }
  $running = @('pipeline_queued','pipeline_waiting_image_api','fetching_source_images','pipeline_copying_source_to_bigseller_drafts','copying_source_to_bigseller_drafts','pipeline_generating_images','generating_images','regenerating_images','pipeline_discovering_bigseller_drafts','discovering_bigseller_drafts','pipeline_saving_bigseller_drafts','saving_bigseller_drafts')
  $taskRoot = Join-Path $dataRoot 'tasks'
  if (Test-Path -LiteralPath $taskRoot) {
    foreach ($task in Get-ChildItem -LiteralPath $taskRoot -Directory) {
      $file = Join-Path $task.FullName 'task.json'
      if (-not (Test-Path -LiteralPath $file)) { continue }
      $record = Get-Content -LiteralPath $file -Raw | ConvertFrom-Json
      if ($record.status -in $running) { throw "Task $($task.Name) is running or has an unresolved running state. Finish/reconcile it before updating." }
    }
  }
  try { $health = Invoke-RestMethod 'http://127.0.0.1:3777/api/health' -TimeoutSec 2 } catch { $health = $null }
  if ($health -and ($health.activeTasks -gt 0 -or $health.activeCommands -gt 0 -or $health.activeMutations -gt 0)) { throw 'The website has active work. Finish it before updating.' }
  $workers = Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object {
    $_.CommandLine -and $_.CommandLine.Contains($script:StudioRoot) -and $_.CommandLine -match '(image2_generator.*cli\.js|bigseller_draft_filler.*fill-drafts\.js)'
  }
  if ($workers) { throw 'A product worker is still running. Reconcile the interrupted task before updating.' }
}

function New-StudioBackup {
  $id = (Get-Date -Format 'yyyyMMdd-HHmmss') + '-' + [Guid]::NewGuid().ToString('N').Substring(0,8)
  $backup = Join-Path $script:StudioRoot ".studio-backups\$id"
  New-Item -ItemType Directory -Path $backup -Force | Out-Null
  Invoke-StudioGit -Arguments @('archive','--format=zip',"--output=$backup\program.zip",'HEAD') | Out-Null
  foreach ($module in @('shopee_local_studio','image2_generator','bigseller_draft_filler')) {
    $dependencies = Join-Path $script:StudioRoot "tools\$module\node_modules"
    if (Test-Path -LiteralPath $dependencies) {
      $destination = Join-Path $backup "dependencies\$module"
      New-Item -ItemType Directory -Path $destination -Force | Out-Null
      Copy-Item -LiteralPath $dependencies -Destination $destination -Recurse
    }
  }
  $dataRoot = Join-Path $script:StudioTool 'data'
  if ($env:STUDIO_DATA_ROOT) { $dataRoot = $env:STUDIO_DATA_ROOT }
  foreach ($name in @('runtime-config.json','product-code-map.json','batch-queue.json')) {
    $file = Join-Path $dataRoot $name
    if (Test-Path -LiteralPath $file) { Copy-Item -LiteralPath $file -Destination $backup }
  }
  $taskRoot = Join-Path $dataRoot 'tasks'
  if (Test-Path -LiteralPath $taskRoot) {
    foreach ($task in Get-ChildItem -LiteralPath $taskRoot -Directory) {
      $file = Join-Path $task.FullName 'task.json'
      if (Test-Path -LiteralPath $file) {
        $dest = Join-Path $backup "tasks\$($task.Name)"
        New-Item -ItemType Directory -Path $dest -Force | Out-Null
        Copy-Item -LiteralPath $file -Destination $dest
      }
    }
  }
  # Product images and browser profiles stay in place; never delete/move them.
  return $backup
}

function Restore-StudioDependencies {
  param([string]$Backup)
  $rootPrefix = [IO.Path]::GetFullPath($script:StudioRoot).TrimEnd('\') + '\'
  $backupPath = [IO.Path]::GetFullPath($Backup)
  if (-not $backupPath.StartsWith((Join-Path $rootPrefix '.studio-backups\'), [StringComparison]::OrdinalIgnoreCase)) { throw 'Backup path is outside this installation.' }
  foreach ($module in @('shopee_local_studio','image2_generator','bigseller_draft_filler')) {
    $saved = Join-Path $backupPath "dependencies\$module\node_modules"
    if (-not (Test-Path -LiteralPath $saved)) { continue }
    $current = [IO.Path]::GetFullPath((Join-Path $script:StudioRoot "tools\$module\node_modules"))
    if (-not $current.StartsWith($rootPrefix, [StringComparison]::OrdinalIgnoreCase)) { throw 'Dependency path is outside this installation.' }
    if (Test-Path -LiteralPath $current) {
      $archive = Join-Path $script:StudioRoot ('.studio-updates\replaced-dependencies\' + [Guid]::NewGuid().ToString('N'))
      New-Item -ItemType Directory -Path (Split-Path -Parent $archive) -Force | Out-Null
      Move-Item -LiteralPath $current -Destination $archive
    }
    Copy-Item -LiteralPath $saved -Destination (Split-Path -Parent $current) -Recurse
  }
}

function Install-StudioDependencies {
  $node = Initialize-StudioRuntime
  $major = Get-StudioNodeMajor -NodePath $node
  if ($major -lt 22) { throw 'Node.js 22 or newer is required. Install Node.js LTS with npm.' }
  $npm = Join-Path (Split-Path -Parent $node) 'npm.cmd'
  if (-not (Test-Path -LiteralPath $npm)) {
    $command = Get-Command npm.cmd -ErrorAction SilentlyContinue
    if (-not $command) { throw 'npm was not found. Install the official Node.js LTS distribution including npm.' }
    $npm = $command.Source
  }
  foreach ($module in @('shopee_local_studio','image2_generator','bigseller_draft_filler')) {
    Push-Location (Join-Path $script:StudioRoot "tools\$module")
    try {
      if (Test-Path -LiteralPath 'package-lock.json') { & $npm ci --ignore-scripts --no-audit --no-fund } else { & $npm install --ignore-scripts --no-audit --no-fund }
      if ($LASTEXITCODE -ne 0) { throw "Dependency installation failed: $module" }
    } finally { Pop-Location }
  }
  $pythonVenv = Join-Path $script:StudioRoot '.studio-runtime\python'
  $pythonExe = Join-Path $pythonVenv 'Scripts\python.exe'
  if (-not (Test-Path -LiteralPath $pythonExe)) {
    $python = Get-Command python.exe -ErrorAction SilentlyContinue
    $py = Get-Command py.exe -ErrorAction SilentlyContinue
    if ($py) { & $py.Source -3 -m venv $pythonVenv }
    elseif ($python) { & $python.Source -m venv $pythonVenv }
    else { throw 'Python 3.10+ is required. Install Python, reopen this window, and run setup/update again.' }
    if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $pythonExe)) { throw 'Could not create the private Python environment.' }
  }
  $requirements = Join-Path $script:StudioRoot 'requirements.txt'
  if (Test-Path -LiteralPath $requirements) { & $pythonExe -m pip install --disable-pip-version-check -r $requirements }
  else { & $pythonExe -m pip install --disable-pip-version-check 'Pillow==13.0.0' }
  if ($LASTEXITCODE -ne 0) { throw 'Pillow installation failed.' }
  & $pythonExe -c 'import sys; from PIL import Image; assert sys.version_info >= (3,10)'
  if ($LASTEXITCODE -ne 0) { throw 'Python/Pillow check failed.' }
  $env:Path = "$(Split-Path -Parent $pythonExe);$env:Path"
}

function Initialize-StudioRuntime {
  $runtimeScript = Join-Path $script:StudioRoot 'tools\node-runtime.ps1'
  if (Test-Path -LiteralPath $runtimeScript) {
    . $runtimeScript
    $node = Resolve-StudioNode
    Set-StudioNodeEnvironment -NodePath $node
    return $node
  }
  # A rollback to the legacy release also works without its own runtime helper.
  $node = Get-Command node.exe -ErrorAction SilentlyContinue
  if (-not $node) { throw 'Node.js is unavailable; install Node.js LTS including npm.' }
  return $node.Source
}

function Stop-StudioForUpdate {
  $stop = Join-Path $script:StudioTool 'stop-background.ps1'
  if (Test-Path -LiteralPath $stop) { & $stop }
  else {
    # Legacy installations have no supervisor or stop script.
    $listeners = Get-NetTCPConnection -LocalPort 3777 -State Listen -ErrorAction SilentlyContinue
    if ($listeners) {
      $stores = Invoke-RestMethod 'http://127.0.0.1:3777/api/stores' -TimeoutSec 3
      if (-not $stores.stores) { throw 'Port 3777 is not the expected website.' }
      foreach ($listener in $listeners) {
        $processInfo = Get-CimInstance Win32_Process -Filter "ProcessId=$($listener.OwningProcess)"
        if ($processInfo.Name -ne 'node.exe' -or $processInfo.CommandLine -notmatch 'src[\\/]server\.js') { throw 'Port owner is not the expected website.' }
        Stop-Process -Id $listener.OwningProcess -Force
      }
    }
  }
  # Let an old supervisor release its mutex before loading new scripts.
  for ($i=0; $i -lt 40; $i++) {
    $mutex = $null
    try { $mutex = [Threading.Mutex]::OpenExisting('Local\ShopeeLocalStudio-3777') } catch [Threading.WaitHandleCannotBeOpenedException] { return }
    $mutex.Dispose()
    Start-Sleep -Milliseconds 250
  }
  throw 'Website supervisor did not stop; update was cancelled.'
}

function Start-StudioAfterUpdate {
  Initialize-StudioRuntime | Out-Null
  $pythonScripts = Join-Path $script:StudioRoot '.studio-runtime\python\Scripts'
  if (Test-Path -LiteralPath $pythonScripts) { $env:Path = "$pythonScripts;$env:Path" }
  foreach ($candidate in @($env:SHOPEE_STORE_FRAME_ROOT,(Join-Path $script:StudioRoot 'watermarks\store-frames'),(Join-Path (Split-Path -Parent $script:StudioRoot) 'watermarks\store-frames'),(Join-Path (Split-Path -Parent $script:StudioRoot) 'watermarks\越南水印储存'))) {
    if ($candidate -and (Test-Path -LiteralPath $candidate)) { $env:SHOPEE_STORE_FRAME_ROOT = $candidate; break }
  }
  & (Join-Path $script:StudioTool 'start-background.ps1')
  $health = Invoke-RestMethod 'http://127.0.0.1:3777/api/health' -TimeoutSec 5
  if (-not $health.ok) { throw 'Website health check failed.' }
}
