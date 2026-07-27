# Store Frame Image Generation Design

## Goal

Use the existing Vietnamese store watermark assets for stores 4-9 as reference images during Shopee image generation, while keeping generated task data in the current task folder structure.

## Design

Local Studio will treat `C:\Users\12295\Desktop\虾皮电商\越南水印储存` as the default store-frame library. The matcher only accepts image files whose names contain the target store number plus `店` and a watermark/frame keyword such as `水印`, and it ignores avatar files such as `头像`. Each target store receives its own matched frame path.

The server resolves store frames right before writing `image2.jobs.json`. The image config builder appends the matched store-frame image to that store's source image list, so `gpt-image-2` can use both the 1-store product reference image and the target-store watermark reference. Prompts will explicitly tell the model to use the frame/watermark reference as the target store visual identity and not to introduce banned Shopee authenticity claims.

The UI will expose a small store-frame status line so it is visible whether the current machine found the watermark folder and which stores have matched assets. Missing frame assets will not block generation; the task log will record missing stores so they can be fixed without breaking the full flow.

## Boundaries

This step does not copy watermark files into every task and does not add a database. It references the existing local asset folder to avoid duplicate storage. Later deployment for the boss can make the frame root configurable through an admin setting or packaged asset folder.

## Testing

Tests will cover store-frame filename matching, avatar exclusion, missing-store behavior, and image config generation that appends each store's own frame to its own jobs.
