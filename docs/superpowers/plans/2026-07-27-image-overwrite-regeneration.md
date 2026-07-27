# Image Overwrite Regeneration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an explicit overwrite mode so existing generated PNGs can be regenerated without manually deleting files.

**Architecture:** Keep default behavior unchanged: non-empty output images are skipped unless overwrite is explicitly requested. The low-level image generator owns skip/overwrite behavior, while Shopee Local Studio exposes a separate regenerate-images action that calls the generator with overwrite enabled.

**Tech Stack:** Node.js ESM, built-in `node:test`, Shopee Local Studio vanilla JS frontend, existing PowerShell wrappers.

---

### Task 1: Image Generator Overwrite Flag

**Files:**
- Modify: `tools/image2_generator/src/jobs.js`
- Modify: `tools/image2_generator/src/cli.js`
- Modify: `tools/image2_generator/test/jobs.test.js`

- [x] Add a failing test that existing non-empty outputs are not skipped when overwrite is true.
- [x] Implement `shouldSkipJobOutput(outputPath, fsImpl, { overwrite })`.
- [x] Add `--overwrite` parsing in the CLI and log `[overwrite]` before regenerating an existing output.
- [x] Run `npm test` in `tools/image2_generator`.

### Task 2: Local Studio Regenerate Action

**Files:**
- Modify: `tools/shopee_local_studio/src/server.js`
- Modify: `tools/shopee_local_studio/public/index.html`
- Modify: `tools/shopee_local_studio/public/app.js`

- [x] Add a `POST /api/tasks/:id/regenerate-images` action that calls image generation with overwrite enabled.
- [x] Add a frontend button labelled `重新生成图片` beside the normal generate button.
- [x] Include the new button in the disabled-state list.
- [x] Run `npm test` in `tools/shopee_local_studio`.

### Task 3: Verification And Commit

**Files:**
- Modify: files from Tasks 1 and 2

- [x] Run all three tool test suites.
- [x] Review `git diff`.
- [x] Commit the change with `Add image overwrite regeneration`.
