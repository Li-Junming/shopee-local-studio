$ErrorActionPreference = 'Stop'
$InstallRoot = Split-Path -Parent $PSScriptRoot
. (Join-Path $PSScriptRoot 'deployment.ps1')
$node = $env:SHOPEE_NODE_EXE
if (-not $node) { $command = Get-Command node.exe -ErrorAction SilentlyContinue; if ($command) { $node = $command.Source } }
if (-not $node) { $node = Join-Path (Split-Path -Parent $InstallRoot) 'ShopeeLocalStudio\runtime\node\node.exe' }
$major = Get-StudioNodeMajor -NodePath $node
if ($major -lt 22) { throw 'Node major version was not read correctly.' }
Write-Host "PASS native Node.js version detection on PowerShell $($PSVersionTable.PSVersion): $major"
$fixture = Join-Path ([IO.Path]::GetTempPath()) ('studio-release-redirect-' + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $fixture | Out-Null
$serverFile = Join-Path $fixture 'server.mjs'
$portFile = Join-Path $fixture 'port.txt'
@'
import http from 'node:http';
import fs from 'node:fs';
const server = http.createServer((req, res) => {
  if (req.method !== 'HEAD') { res.writeHead(405); res.end(); return; }
  if (req.url === '/latest') { res.writeHead(302, { location: '/releases/tag/v7.8.9' }); res.end(); return; }
  if (req.url === '/releases/tag/v7.8.9') { res.writeHead(200); res.end(); return; }
  res.writeHead(200); res.end();
});
server.listen(0, '127.0.0.1', () => fs.writeFileSync(process.argv[2], String(server.address().port)));
'@ | Set-Content -LiteralPath $serverFile -Encoding UTF8
$process = Start-Process -FilePath $node -ArgumentList @(('"'+$serverFile+'"'),('"'+$portFile+'"')) -WindowStyle Hidden -PassThru
try {
  for ($i=0; $i -lt 40 -and -not (Test-Path -LiteralPath $portFile); $i++) { Start-Sleep -Milliseconds 100 }
  $port = (Get-Content -LiteralPath $portFile -Raw).Trim()
  $version = Get-PublishedStudioVersion -LatestUrl "http://127.0.0.1:$port/latest"
  if ($version -ne 'v7.8.9') { throw 'Release redirect was not resolved correctly.' }
  $rejected = $false
  try { Get-PublishedStudioVersion -LatestUrl "http://127.0.0.1:$port/not-a-release" | Out-Null } catch { $rejected = $true }
  if (-not $rejected) { throw 'A non-release URL was incorrectly accepted.' }
  Write-Host 'PASS published-release redirect detection and invalid URL rejection; no REST API involved.'
  foreach ($name in @('更新网站.ps1','升级旧版.ps1')) {
    $source = Get-Content -LiteralPath (Join-Path $InstallRoot $name) -Raw
    if ($source -match 'api\.github\.com') { throw "Anonymous API dependency returned: $name" }
  }
} finally { if (-not $process.HasExited) { Stop-Process -Id $process.Id -Force } }
