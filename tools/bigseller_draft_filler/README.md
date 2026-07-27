# BigSeller 草稿箱编辑助手

这个工具用于打开 BigSeller Shopee 商品编辑页，按当前页面里的店铺名称自动匹配素材文件夹，然后填入标题、详情和 PNG 商品图。

它只会在你明确使用 `-Save` 时点击白色的 `保存` 按钮，不会点击 `保存&发布`。

## 准备素材

每个商品准备一个素材根目录，里面按店铺分文件夹：

```text
商品输出目录/
  store_7_skinora/
    01_main.png
    02_real.png
    03_real.png
    04_real.png
    title.txt
    detail.txt
  store_8_skinora_beauty/
    01_main.png
    02_real.png
    03_real.png
    04_real.png
    title.txt
    detail.txt
  store_9_elora_skin/
    01_main.png
    02_real.png
    03_real.png
    04_real.png
    title.txt
    detail.txt
```

图片只读取 `.png`，并按文件名排序上传，所以建议保持 `01_`、`02_` 这种顺序。

## 配置任务

复制 `jobs.example.json` 为 `jobs.json`，然后改这几个字段：

- `assetRoot`: 这个商品的输出目录。
- `editUrl`: BigSeller 草稿箱里对应店铺、对应商品的编辑页 URL。
- `storeMap`: 店铺名称和素材文件夹的对应关系。当前已经按 7、8、9 店写好。

一个商品如果复制到了 7、8、9 三个店，就在 `jobs` 里放 3 个编辑页 URL。工具会打开每个 URL，从页面识别店铺，然后自动用对应店铺文件夹。

## 按 SKU 自动找编辑页

如果不想手动复制每个编辑页 URL，用 `sku-jobs.example.json` 这种配置：

```json
{
  "discoverJobs": [
    {
      "name": "Charlotte Tilbury Airbrush Flawless",
      "skus": ["CT860101", "CT860102", "CT860103", "CT860104"],
      "assetRoot": "C:/Users/12295/Documents/Codex/2026-07-16/ni/outputs/商品输出目录"
    }
  ]
}
```

生成编辑任务：

```powershell
.\run.ps1 -Config sku-jobs.json -Discover -Out jobs.next.json
```

它会进入 BigSeller 草稿箱列表，按 SKU 组找到 7、8、9 店对应商品行，点击编辑按钮并读取真实编辑页 URL，然后生成 `jobs.next.json`。

生成后照常检查、填充、保存：

```powershell
.\run.ps1 -Config jobs.next.json
.\run.ps1 -Config jobs.next.json -Fill
.\run.ps1 -Config jobs.next.json -Save
```

## 运行

先做检查，不改页面：

```powershell
.\run.ps1 -Config jobs.json
```

第一次会打开一个新的 Chrome 自动化窗口。如果 BigSeller 要登录，就在这个窗口里手动登录一次，再重新运行命令。

也可以单独打开登录窗口：

```powershell
.\run.ps1 -Config jobs.json -Login
```

登录成功后窗口会自动关闭，后续命令会继续使用这个登录状态。

填入标题、详情和图片，但不保存：

```powershell
.\run.ps1 -Config jobs.json -Fill
```

确认没问题后，填入并点击白色 `保存`：

```powershell
.\run.ps1 -Config jobs.json -Save
```

## 注意

当前版本会通过页面里的第一个图片上传控件上传 PNG。不同 BigSeller 页面可能是“追加图片”而不是“替换旧图”。第一次请先用 `-Fill` 跑一页确认；如果旧图没有被替换，需要先在页面手动清空旧商品图，或后续我再按你实际页面 DOM 补一个“自动删除旧图”的步骤。
