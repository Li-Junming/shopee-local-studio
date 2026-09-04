# Project Summary: Shopee Local Studio

## One-Sentence Description

Shopee Local Studio is a local automation platform for Shopee listing operations, built to reduce repeated SKU search, BigSeller draft editing, multi-store image generation, and manual save work.

## Problem

In a Shopee multi-store workflow, one product often needs to be copied, adapted, and saved across several stores. The repeated work includes searching products by SKU or Item ID, confirming the correct source item, copying drafts, preparing store-specific images, writing Vietnamese listing copy, and saving drafts in BigSeller.

The project targets this repeated workflow with a local web workspace and browser automation, while keeping manual confirmation gates for risky steps.

## Implemented Capabilities

- Task workspace: create, search, resume, archive, restore, and inspect product tasks.
  Evidence: `tools/shopee_local_studio/src/studio.js`, `tools/shopee_local_studio/public/index.html`.

- One-click pipeline: coordinate source lookup, confirmation, draft copying, image generation, draft discovery, and draft saving.
  Evidence: `tools/shopee_local_studio/src/studio.js`, `tools/shopee_local_studio/test/core.test.js`.

- BigSeller UI automation: use Playwright to control draft listing pages, search modes, edit pages, title/detail fields, image upload, and save feedback.
  Evidence: `tools/bigseller_draft_filler/src/fill-drafts.js`, `tools/bigseller_draft_filler/test/search-mode.test.js`.

- SKU and Item ID fallback: search active listings by SKU, sold-out listings by SKU, active listings by Item ID, then sold-out listings by Item ID when a numeric Item ID exists.
  Evidence: `tools/bigseller_draft_filler/test/search-mode.test.js`.

- Store-specific image generation: generate four PNG product assets per selected store, defaulting to stores 4-9.
  Evidence: `tools/shopee_local_studio/src/image2-config.js`, `tools/shopee_local_studio/test/core.test.js`.

- Image API reliability handling: classify transient failures, retry 502 and timeout errors, downgrade concurrency, skip existing images, and continue when configured.
  Evidence: `tools/image2_generator/src/scheduler.js`, `tools/image2_generator/test/scheduler.test.js`.

- Listing copy validation: validate Vietnamese listing title length, buyer-facing detail text, banned platform words, and source identity rules.
  Evidence: `tools/shopee_local_studio/src/listing-copy.js`, `tools/shopee_local_studio/test/core.test.js`.

- Failure visibility: task status, stage timing, preflight checks, logs, and next-action messages are surfaced in the local UI.
  Evidence: `tools/shopee_local_studio/src/core.js`, `tools/shopee_local_studio/src/studio.js`, `tools/shopee_local_studio/test/core.test.js`.

## Architecture

The system is split into three main modules:

- `shopee_local_studio`: local web server, static UI, task storage, workflow orchestration, config generation, validation, and result browsing.
- `bigseller_draft_filler`: Playwright-based BigSeller automation for login, source lookup, draft discovery, copying, filling, and saving.
- `image2_generator`: OpenAI-compatible image generation CLI with retry and scheduling behavior.

Data flow:

1. User enters SKU, Item ID, or product-code mapping in the local web page.
2. The studio creates a task folder and configuration files.
3. BigSeller automation finds the source product and target drafts.
4. The image generator writes store-specific PNG assets.
5. Listing copy files and generated images are passed back to BigSeller automation.
6. The local workspace records status, logs, and timing for review and resume.

## Testing Evidence

The repository uses Node's built-in test runner.

Current test suites:

- `tools/shopee_local_studio`: workflow, UI, validation, task state, preflight, and result search tests.
- `tools/image2_generator`: image API retry, timeout, concurrency downgrade, output, and config tests.
- `tools/bigseller_draft_filler`: Playwright automation planning, search-mode, SKU/Item ID fallback, and save safety tests.

Current verified test count from local execution:

- `tools/shopee_local_studio`: 117 tests passing.
- `tools/image2_generator`: 20 tests passing.
- `tools/bigseller_draft_filler`: 37 tests passing.
- Total: 174 tests passing.

## Resume Positioning

Recommended resume bullets:

- 开发 Shopee 本地自动化工具，串联 SKU 检索、生图、草稿保存等上架流程。
- 使用 Playwright 自动操作 BigSeller，支持在售/售完与 SKU/Item ID 兜底搜索。
- 接入多图并发生成、失败重试和断点续跑，压缩商品素材处理时间。
- 与 Codex 协作完成功能迭代，建立 174 个回归测试验证核心流程。

Conservative contribution boundary:

需求拆解、流程设计、页面调试、测试验证和 GitHub 维护由本人完成；编码实现过程中使用 Codex 辅助开发和排查问题，并由本人负责方案判断与结果验证。

## Fit for Agent / Test Development Roles

- UI automation: strong fit, because the project controls a real web back office through Playwright and handles unstable UI states.
- Automation platform development: strong fit, because it provides a local UI, task state, logs, preflight checks, and repeatable workflows.
- Failure handling and diagnosis: medium-to-strong fit, because it records stage failures, retry behavior, risk checks, and next-action messages.
- LLM / Agent relevance: medium fit. The project uses image generation APIs and Codex-assisted development, but it should not be described as an Agent evaluation platform unless dedicated evaluation logic is added.
- Regression testing: strong fit, because the project has 174 tests across workflow, UI, validation, retry, and browser automation planning.
- Python relevance: limited. The main implementation is Node.js and Playwright, not Python.

## Metrics to Measure Next

The following numbers should be measured before writing stronger quantified resume claims:

- Average time to process one product manually.
- Average time to process one product with the local studio.
- Success rate across 10-20 real SKU tasks.
- Average number of image API retries per product.
- Manual intervention count per product.
- BigSeller save success rate after draft discovery.

Without those measurements, use conservative wording such as "压缩商品素材处理时间" instead of a fixed percentage.
