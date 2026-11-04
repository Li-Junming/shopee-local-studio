param(
  [string]$Config = "jobs.json",
  [string]$Out = "jobs.discovered.json",
  [string]$OutDir = "source-images",
  [switch]$Fill,
  [switch]$Save,
  [switch]$Login,
  [switch]$Discover,
  [switch]$Source,
  [switch]$Copy,
  [switch]$Help,
  [string]$NodePath = ""
)

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot
. (Join-Path (Split-Path -Parent $PSScriptRoot) "node-runtime.ps1")
$nodeExecutable = Resolve-StudioNode -NodePath $NodePath
Set-StudioNodeEnvironment -NodePath $nodeExecutable

if ($Help) {
  & $nodeExecutable "src/fill-drafts.js" "--help"
  exit $LASTEXITCODE
}

if (!(Test-Path "node_modules")) {
  $env:PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD = "1"
  $npmCli = Join-Path (Split-Path -Parent $nodeExecutable) "node_modules\npm\bin\npm-cli.js"
  if (Test-Path -LiteralPath $npmCli) {
    & $nodeExecutable $npmCli install
  } else {
    & npm.cmd install
  }
  if ($LASTEXITCODE -ne 0) { throw "npm install failed with code $LASTEXITCODE" }
}

$argsList = @("src/fill-drafts.js", "--config", $Config)
if ($Save) {
  $argsList += "--save"
} elseif ($Discover) {
  $argsList += @("--discover", "--out", $Out)
} elseif ($Source) {
  $argsList += @("--source", "--out-dir", $OutDir)
} elseif ($Copy) {
  $argsList += "--copy"
} elseif ($Login) {
  $argsList += "--login"
} elseif ($Fill) {
  $argsList += "--fill"
}

& $nodeExecutable @argsList
exit $LASTEXITCODE
