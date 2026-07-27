param(
  [int]$Port = 3777,
  [string]$HostName = "127.0.0.1"
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Push-Location $root
try {
  $env:PORT = "$Port"
  $env:HOST = "$HostName"
  node .\src\server.js
}
finally {
  Pop-Location
}
