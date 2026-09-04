# Local Deployment Guide

This guide explains how to run Shopee Local Studio on a fresh Windows machine.

## Requirements

- Windows 10 or later.
- Git.
- Node.js LTS, including `npm`.
- Google Chrome.
- A valid OpenAI-compatible image API URL and API key.
- BigSeller account access.
- Optional store-frame assets for stores 4-9.

## First-Time Setup

Recommended installation directory:

```text
C:\ShopeeLocalStudio
```

Clone and install:

```powershell
git clone https://github.com/Li-Junming/shopee-local-studio.git C:\ShopeeLocalStudio\ni
cd C:\ShopeeLocalStudio\ni
powershell -ExecutionPolicy Bypass -File .\首次部署.ps1
```

After setup, open:

```text
http://127.0.0.1:3777
```

In the left panel, fill in:

- API base URL.
- API key.

Then log in to BigSeller once:

```powershell
cd C:\ShopeeLocalStudio\ni\tools\bigseller_draft_filler
powershell -ExecutionPolicy Bypass -File .\run.ps1 -Login
```

The browser login state is stored locally and is not committed to Git.

## Daily Startup

```powershell
cd C:\ShopeeLocalStudio\ni
powershell -ExecutionPolicy Bypass -File .\启动网站.ps1
```

Open:

```text
http://127.0.0.1:3777
```

## Updating From GitHub

```powershell
cd C:\ShopeeLocalStudio\ni
git pull
powershell -ExecutionPolicy Bypass -File .\启动网站.ps1
```

## Store Frame Assets

The repository does not include local watermark or frame assets.

Put the assets in:

```text
C:\ShopeeLocalStudio\watermarks\越南水印储存
```

Or configure a custom folder:

```powershell
[Environment]::SetEnvironmentVariable("SHOPEE_STORE_FRAME_ROOT", "D:\path\to\watermarks", "User")
```

## Local-Only Data

The following files are intentionally not synchronized through GitHub:

- API keys and local secrets.
- BigSeller browser login state.
- Generated product images.
- Historical task data.
- `node_modules`.
- Local temporary files.

This keeps the repository safe for public project presentation while allowing each machine to run its own local workflow.
