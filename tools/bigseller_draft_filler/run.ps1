param(
  [string]$Config = "jobs.json",
  [string]$Out = "jobs.discovered.json",
  [string]$OutDir = "source-images",
  [switch]$Fill,
  [switch]$Save,
  [switch]$Login,
  [switch]$Discover,
  [switch]$Source,
  [switch]$Help
)

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

if (!(Test-Path "node_modules")) {
  $env:PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD = "1"
  npm install
}

if ($Help) {
  node "src/fill-drafts.js" "--help"
  exit $LASTEXITCODE
}

$argsList = @("src/fill-drafts.js", "--config", $Config)
if ($Save) {
  $argsList += "--save"
} elseif ($Discover) {
  $argsList += @("--discover", "--out", $Out)
} elseif ($Source) {
  $argsList += @("--source", "--out-dir", $OutDir)
} elseif ($Login) {
  $argsList += "--login"
} elseif ($Fill) {
  $argsList += "--fill"
}

node @argsList
exit $LASTEXITCODE
