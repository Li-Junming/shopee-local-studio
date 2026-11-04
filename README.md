# Shopee Local Studio

Windows users: see [新版部署、老板旧版升级与回退](DEPLOYMENT.md). From v0.2.0, use the `.cmd` launchers for startup, stable-release updates and rollback. Existing installations can use the standalone `升级旧版.ps1` release asset without moving local tasks or images.

Shopee Local Studio is a local automation workspace for Shopee cross-border listing operations. It connects product lookup, BigSeller draft copying, store-specific image generation, listing copy preparation, and draft saving into one repeatable workflow.

The project was built as a personal engineering project around a real operations pain point: Shopee listing work often requires repeated SKU searches, multi-store draft maintenance, image preparation, and manual checks across BigSeller pages. This tool keeps the operator in control while automating the repetitive browser and asset steps.

## Highlights

- Local web workspace for creating and resuming product tasks.
- Playwright automation for BigSeller draft discovery, copying, editing, and saving.
- SKU and Item ID fallback search across active and sold-out listings.
- Store-specific image generation for stores 4-9, with four image slots per store.
- Retry, timeout handling, concurrency downgrade, and resume support for slow image APIs.
- Vietnamese title and detail generation with validation rules for platform constraints.
- Task logs, stage timing, preflight checks, image review flags, and result search.
- Local deployment scripts for a fresh Windows machine.

## Core Workflow

1. Paste an Item ID, SKU, or product-code mapping into the local studio.
2. Search the 1-store source product and confirm the source evidence.
3. Copy the 1-store draft to target stores 4-9.
4. Generate store-specific product images.
5. Discover target-store BigSeller draft edit links.
6. Fill and save title, detail, and images back to BigSeller drafts.
7. Review generated outputs and task logs from the local page.

## Search Strategy

For source and draft discovery, the BigSeller automation searches in this order:

1. Active listings by SKU.
2. Sold-out listings by SKU.
3. Active listings by numeric Item ID.
4. Sold-out listings by numeric Item ID.

This handles products whose SKU still exists but whose active inventory is already sold out.

## Tech Stack

- Node.js ESM for local services and CLI tools.
- Native HTML/CSS/JavaScript for the local workspace UI.
- Playwright for BigSeller browser automation.
- OpenAI-compatible image API integration for product image generation.
- PowerShell scripts for Windows setup and startup.
- Node test runner for regression coverage.

## Repository Structure

```text
tools/
  shopee_local_studio/      Local web workspace, task state, workflow orchestration
  bigseller_draft_filler/   Playwright automation for BigSeller draft pages
  image2_generator/         OpenAI-compatible image generation helper
docs/
  project-summary.md        Resume and interview-oriented project summary
  superpowers/              Design and implementation notes from project iteration
首次部署.ps1                 First-time local setup script
启动网站.ps1                 Daily local startup script
DEPLOYMENT.md               Fresh-machine deployment guide
```

Generated outputs, local task data, API keys, browser login state, and `node_modules` are intentionally excluded from Git.

## Tests

The project contains regression tests across the three main modules:

- `tools/shopee_local_studio`: workflow state, preflight checks, listing copy, UI rendering, task/image search.
- `tools/image2_generator`: image API URL building, retry classification, timeout handling, concurrency downgrade, overwrite behavior.
- `tools/bigseller_draft_filler`: BigSeller config loading, search modes, SKU/Item ID fallback, draft matching, save-mode safety.

Run all test suites manually:

```powershell
cd tools\shopee_local_studio
npm test

cd ..\image2_generator
npm test

cd ..\bigseller_draft_filler
npm test
```

The GitHub Actions workflow also runs these suites on push and pull request.

## Local Setup

See [DEPLOYMENT.md](DEPLOYMENT.md) for a fresh Windows machine setup guide.

Short version:

```powershell
git clone https://github.com/Li-Junming/shopee-local-studio.git C:\ShopeeLocalStudio\ni
cd C:\ShopeeLocalStudio\ni
powershell -ExecutionPolicy Bypass -File .\首次部署.ps1
```

Then open `http://127.0.0.1:3777`, configure the image API in the left panel, and log in to BigSeller once through the Playwright browser profile:

```powershell
cd C:\ShopeeLocalStudio\ni\tools\bigseller_draft_filler
powershell -ExecutionPolicy Bypass -File .\run.ps1 -Login
```

## Resume-Friendly Summary

This project demonstrates practical automated test and tooling experience:

- Built a local automation platform for a real Shopee/BigSeller listing workflow.
- Used Playwright to automate complex web operations with SKU and Item ID fallback logic.
- Added retry, concurrency downgrade, and resume handling for unstable image generation APIs.
- Maintained regression tests for workflow state, UI structure, search behavior, validation, and failure handling.

Conservative project wording: this is a personal project developed around a real operations scenario, with Codex used as a coding assistant during implementation and debugging.
