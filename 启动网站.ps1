$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'scripts\deployment.ps1')
Start-StudioAfterUpdate
Start-Process 'http://127.0.0.1:3777/'
