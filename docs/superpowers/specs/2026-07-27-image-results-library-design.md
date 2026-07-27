# Image Results Library Design

Add a first-version image results library to Local Studio so generated images are easier to find, download, and archive.

The server will expose `GET /api/image-results?q=&includeArchived=`. It scans task folders, reuses existing task search rules, includes only tasks with generated images, and returns compact summaries: task identity, product code/SKU text, stores with image counts, first preview images, timestamps, status, archive state, and download URL.

The frontend will add a results section in the task workspace. It has its own search input and archive toggle, renders one row/card per task with preview thumbnails, shows per-store counts, and provides open/select, download, and archive/unarchive actions. This does not move files or alter generation output paths.

This first version indexes existing task folders on demand instead of adding a database. That keeps storage simple and avoids duplicating image metadata. Later versions can add persistent metadata, cleanup rules, and batch export once the workflow is stable.
