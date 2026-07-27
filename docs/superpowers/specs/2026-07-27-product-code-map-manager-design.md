# Product Code Map Manager Design

Add a small Local Studio maintenance panel for editing the local product-code-to-SKU mapping file.

The server will expose `GET /api/product-code-map`, `PUT /api/product-code-map/:code`, and `DELETE /api/product-code-map/:code`. These endpoints read and write the same ignored local JSON file used by task parsing: `tools/shopee_local_studio/data/product-code-map.json`, or `PRODUCT_CODE_MAP_PATH` when set.

Core map helpers will normalize product codes and SKU values consistently with task parsing. Saving a mapping replaces that product code's SKU group. Deleting removes only that product code. Invalid requests, such as an empty product code or empty SKU group, return clear errors.

The frontend will add a compact management panel below the task creation form. It shows existing mappings, lets the operator enter one product code and a whitespace-separated SKU group, and offers save/delete controls. The panel reloads after changes so the operator sees the current local map before creating tasks.

Real mappings remain outside Git because the writable `data/` directory is ignored. The committed example file remains the template for initial setup.
