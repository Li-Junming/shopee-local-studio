param([switch]$NoStart)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'scripts\deployment.ps1')
Assert-StudioIdle
$chromePaths = @("$env:ProgramFiles\Google\Chrome\Application\chrome.exe", "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe", "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe")
if (-not ($chromePaths | Where-Object { Test-Path -LiteralPath $_ })) { throw 'Google Chrome is required. Install it and run setup again.' }
Install-StudioDependencies
if (-not $NoStart) {
  Start-StudioAfterUpdate
  Start-Process 'http://127.0.0.1:3777/'
}
Write-Host 'Setup complete. Configure the image API locally, then use the BigSeller login launcher.'
