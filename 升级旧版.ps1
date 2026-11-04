param([string]$InstallRoot = 'C:\ShopeeLocalStudio\ni', [string]$Version = '')
$ErrorActionPreference = 'Stop'
$InstallRoot = (Resolve-Path -LiteralPath $InstallRoot).Path
if (-not (Test-Path -LiteralPath (Join-Path $InstallRoot '.git'))) { throw 'Select the original Git installation directory (the folder containing tools and .git).' }
$origin = & git -C $InstallRoot remote get-url origin
if ($LASTEXITCODE -ne 0 -or $origin.TrimEnd('/') -notin @('https://github.com/Li-Junming/shopee-local-studio.git','https://github.com/Li-Junming/shopee-local-studio','git@github.com:Li-Junming/shopee-local-studio.git')) { throw 'Not the expected repository.' }
if (-not $Version) { $Version = (Invoke-RestMethod 'https://api.github.com/repos/Li-Junming/shopee-local-studio/releases/latest' -Headers @{ 'User-Agent'='ShopeeLocalStudio-Upgrader' }).tag_name }
if ($Version -notmatch '^v\d+\.\d+\.\d+$') { throw 'A stable release tag is required.' }
& git -C $InstallRoot fetch origin --tags
if ($LASTEXITCODE -ne 0) { throw 'Download failed. The current program was not changed.' }
$bootstrap = Join-Path $InstallRoot '.studio-updates\bootstrap'
New-Item -ItemType Directory -Path (Join-Path $bootstrap 'scripts') -Force | Out-Null
foreach ($entry in @(@{ source='scripts/deployment.ps1'; target='scripts\deployment.ps1' }, @{ source='更新网站.ps1'; target='updater.ps1' })) {
  $text = & git -C $InstallRoot show "refs/tags/${Version}:$($entry.source)"
  if ($LASTEXITCODE -ne 0) { throw 'Release does not contain a compatible updater.' }
  [IO.File]::WriteAllText((Join-Path $bootstrap $entry.target), ($text -join "`r`n"), [Text.UTF8Encoding]::new($true))
}
# Run the new maintenance code outside tracked files. Old releases can therefore
# be backed up and upgraded without first overwriting their program files.
& (Join-Path $bootstrap 'updater.ps1') -Version $Version -InstallRoot $InstallRoot
