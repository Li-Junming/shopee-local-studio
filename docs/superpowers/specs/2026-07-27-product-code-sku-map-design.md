# Product Code SKU Map Design

Add a local product-code-to-SKU mapping step before task creation and BigSeller lookup.

Local Studio will read a JSON map from `tools/shopee_local_studio/data/product-code-map.json`, or from `PRODUCT_CODE_MAP_PATH` when set. The `data/` directory is ignored by Git, so real business mappings stay local and do not grow repository history.

The map accepts simple entries such as:

```json
{
  "PC001": ["SKU001", "SKU002"],
  "PC002": "SKU003 SKU004"
}
```

When a pasted task or form input contains a mapped product code, the server expands it to the mapped SKU group. Unmapped identifiers continue to behave as raw SKUs. Tasks record `productCodes` and `productCodeMappings` when expansion happens, and the UI displays `PC001 -> SKU001 SKU002` so the operator can verify the resolved search target.

BigSeller discovery and 1-store source lookup remain SKU-based. This keeps the automation stable while allowing the operator to input either internal product codes or direct SKUs.
