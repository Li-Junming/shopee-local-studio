# Local Deployment Guide

> 新版 Windows 部署与旧版升级请先按下面步骤操作。不要在商品任务运行期间更新。

## 老板已有旧版：首次升级

不用重新建目录，也不用搬动任务和图片。先让旧版商品任务完成，再从本仓库最新 Release 下载 `upgrade-existing.ps1`（仓库源码名为 `升级旧版.ps1`），在 PowerShell 执行：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$env:USERPROFILE\Downloads\upgrade-existing.ps1" -InstallRoot "C:\ShopeeLocalStudio\ni"
```

如果老板原来装在其他目录，将 `-InstallRoot` 改成原来包含 `.git` 和 `tools` 的目录。脚本只从本仓库的稳定版本标签读取更新器；先检查运行任务和本地代码修改，再备份旧版，最后更新。下载或检查失败时保留现有程序。

## 后续日常使用

- `启动网站.cmd`：启动网站；已启动时不会强制重启。
- `更新网站.cmd`：更新到 GitHub 最新正式 Release，安装依赖并检查网站。
- `回退网站.cmd`：退回上次更新前的代码，保留当前任务、图片、API 配置和登录资料。
- `停止网站.cmd`：主动关闭网站及自动恢复功能。请先让商品任务结束。
- `登录BigSeller.cmd`：在这台电脑的独立浏览器目录中登录。

备份在安装目录 `.studio-backups`，更新状态在 `.studio-updates`。备份包含旧版程序、配置和任务 JSON。生成图片和浏览器资料保留原处，不复制进更新包，也不会被更新脚本清理。**回退只恢复代码，不把任务数据回退到旧快照**；若跨越不兼容数据格式的大版本，应先单独迁移，不能直接套用本脚本。

更新器不执行 `git reset --hard` 或 `git clean`。如果有手动改过的程序文件，会停止更新，请先保留并处理这些修改。回退到较早、尚无更新入口的版本后，可再次使用下载的 `升级旧版.ps1` 升级。

## 新电脑首次部署（v0.2.0 起）

安装 Git、Node.js 22+（含 npm）、Google Chrome、Python 3.10+ 后执行：

```powershell
git clone https://github.com/Li-Junming/shopee-local-studio.git C:\ShopeeLocalStudio\ni
cd C:\ShopeeLocalStudio\ni
git checkout --detach v0.2.1
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\首次部署.ps1
```

首次部署会安装三个模块的 npm 依赖，并建立独立 Python 环境、安装 Pillow。随后在本机页面设置接口并登录 BigSeller。公开仓库不包含运行环境安装包或任何账号。

水印可以沿用旧环境变量，或放在 `C:\ShopeeLocalStudio\watermarks\store-frames` / `C:\ShopeeLocalStudio\watermarks\越南水印储存`。这些本地文件不随代码发布。

`localhost:57609/v1` 指向当前电脑，老板电脑必须有自己的中转服务，或改成可访问的远程接口。网站自动恢复只适用于电脑开机且守护进程仍在运行时；不会恢复付费生图请求或自动继续旧商品任务。

## 发布新版本

1. 运行三个模块测试及 `scripts/test-deployment.ps1`，检查提交中没有密钥、本地数据或浏览器资料。
2. 更新 `VERSION.json` 和 `RELEASE_NOTES.md`，提交代码。
3. 推送对应的稳定标签，如 `v0.2.1`。
4. `Stable release` 工作流测试通过后才会发布源码 ZIP、SHA-256 校验文件和旧版升级脚本。工作流失败时，不会生成正式 Release。

以下英文内容保留作早期版本参考；**日常更新请使用上面的更新脚本，避免直接在运行中的网站上执行 git pull**。

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
