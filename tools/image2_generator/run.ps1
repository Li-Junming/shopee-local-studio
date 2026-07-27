param(
  [string]$Config = "jobs.image2.example.json",
  [switch]$DryRun,
  [string]$BaseUrl = "",
  [int]$Concurrency = 0
)

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

$argsList = @("src/cli.js", "--config", $Config)
if ($DryRun) { $argsList += "--dry-run" }
if ($BaseUrl) { $argsList += @("--base-url", $BaseUrl) }
if ($Concurrency -gt 0) { $argsList += @("--concurrency", "$Concurrency") }

node @argsList
exit $LASTEXITCODE
