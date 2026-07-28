# Store Differentiation Prompts Design

Strengthen multi-store image generation so the same product does not look like one reused design with different frames.

Each supported store gets a structured visual profile: palette, composition, buyer hook, and avoid list. The image prompt builder injects that profile into every generated job for that store, including product poster, effect poster, and buyer-style real photos.

When a task targets multiple stores, each store prompt also names the sibling selected stores and instructs the model not to reuse their layout, palette, hero crop, or benefit hierarchy. This is a generation-time control, not an image-similarity detector.

The first version focuses on prompt-level prevention because it affects every generation path and keeps the workflow stable. Later versions can add post-generation visual QA using image comparison once enough real outputs exist.
