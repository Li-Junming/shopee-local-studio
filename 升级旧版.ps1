param([string]$InstallRoot = 'C:\ShopeeLocalStudio\ni', [string]$Version = '')
$ErrorActionPreference = 'Stop'
$InstallRoot = (Resolve-Path -LiteralPath $InstallRoot).Path
if (-not (Test-Path -LiteralPath (Join-Path $InstallRoot '.git'))) { throw 'Select the original Git installation directory (the folder containing tools and .git).' }
$origin = & git -C $InstallRoot remote get-url origin
if ($LASTEXITCODE -ne 0 -or $origin.TrimEnd('/') -notin @('https://github.com/Li-Junming/shopee-local-studio.git','https://github.com/Li-Junming/shopee-local-studio','git@github.com:Li-Junming/shopee-local-studio.git')) { throw 'Not the expected repository.' }
if (-not $Version) {
  # Resolve GitHub's published-release redirect without the anonymous REST API.
  $response = Invoke-WebRequest 'https://github.com/Li-Junming/shopee-local-studio/releases/latest' -Method Head -UseBasicParsing -TimeoutSec 30
  $uri = $response.BaseResponse.ResponseUri
  if (-not $uri) { $uri = $response.BaseResponse.RequestMessage.RequestUri }
  if ([string]$uri -notmatch '/releases/tag/(v\d+\.\d+\.\d+)/?$') { throw 'Could not resolve latest published release. Specify -Version vX.Y.Z explicitly.' }
  $Version = $Matches[1]
}
if ($Version -notmatch '^v\d+\.\d+\.\d+$') { throw 'A stable release tag is required.' }
& git -C $InstallRoot fetch origin --tags
if ($LASTEXITCODE -ne 0) { throw 'Download failed. The current program was not changed.' }
$bootstrap = Join-Path $InstallRoot '.studio-updates\bootstrap'
New-Item -ItemType Directory -Path (Join-Path $bootstrap 'scripts') -Force | Out-Null
$archive = Join-Path $bootstrap 'updater.zip'
& git -C $InstallRoot archive --format=zip "--output=$archive" "refs/tags/$Version" -- 'scripts/deployment.ps1' '更新网站.ps1'
if ($LASTEXITCODE -ne 0) { throw 'Release does not contain a compatible updater.' }
Expand-Archive -LiteralPath $archive -DestinationPath $bootstrap -Force
Copy-Item -LiteralPath (Join-Path $bootstrap '更新网站.ps1') -Destination (Join-Path $bootstrap 'updater.ps1') -Force
# Run the new maintenance code outside tracked files. Old releases can therefore
# be backed up and upgraded without first overwriting their program files.
& (Join-Path $bootstrap 'updater.ps1') -Version $Version -InstallRoot $InstallRoot
