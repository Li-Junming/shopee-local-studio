$studioPackageRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)

function Resolve-StudioNode {
  param([string]$NodePath = "")

  if (-not $NodePath) { $NodePath = $env:SHOPEE_NODE_EXE }
  if ($NodePath) {
    if (-not [IO.Path]::IsPathRooted($NodePath) -or -not (Test-Path -LiteralPath $NodePath -PathType Leaf)) {
      throw "Configured Node executable does not exist: $NodePath"
    }
    return (Resolve-Path -LiteralPath $NodePath).Path
  }
  $bundledNode = Join-Path $studioPackageRoot 'runtime\node\node.exe'
  if (Test-Path -LiteralPath $bundledNode -PathType Leaf) { return $bundledNode }
  $command = Get-Command node.exe -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($command) { return $command.Source }

  foreach ($folder in @([Environment]::GetFolderPath('ProgramFiles'), [Environment]::GetFolderPath('ProgramFilesX86'), [Environment]::GetFolderPath('LocalApplicationData'))) {
    if (-not $folder) { continue }
    $candidate = Join-Path $folder 'nodejs\node.exe'
    if (Test-Path -LiteralPath $candidate -PathType Leaf) { return $candidate }
  }
  throw "Node.js was not found. Install Node.js or set SHOPEE_NODE_EXE to the absolute node.exe path."
}

function Set-StudioNodeEnvironment {
  param([Parameter(Mandatory = $true)][string]$NodePath)
  $env:SHOPEE_NODE_EXE = $NodePath
  $nodeDir = Split-Path -Parent $NodePath
  $env:Path = "$nodeDir;$env:Path"
  $pythonDir = Join-Path $env:LOCALAPPDATA 'Programs\Python\Python313'
  if (Test-Path -LiteralPath (Join-Path $pythonDir 'python.exe')) {
    $env:Path = "$pythonDir;$pythonDir\Scripts;$env:Path"
  }
  $projectPythonDir = Join-Path $studioPackageRoot 'runtime\python-env\Scripts'
  if (Test-Path -LiteralPath (Join-Path $projectPythonDir 'python.exe')) {
    $env:Path = "$projectPythonDir;$env:Path"
  }
  $repoPythonDir = Join-Path (Split-Path -Parent $PSScriptRoot) '.studio-runtime\python\Scripts'
  if (Test-Path -LiteralPath (Join-Path $repoPythonDir 'python.exe')) {
    $env:Path = "$repoPythonDir;$env:Path"
  }
}
