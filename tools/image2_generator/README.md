# image2_generator

OpenAI-compatible `gpt-image-2` image generation helper for Shopee product assets.

## Environment

Set your API key and, if using a relay, the compatible base URL:

```powershell
$env:OPENAI_API_KEY="sk-..."
$env:OPENAI_BASE_URL="https://api.openai.com/v1"
```

For a relay, replace `OPENAI_BASE_URL` with the relay's `/v1` base URL.
`OPENAI_BASE_URL` takes priority over any `baseUrl` in a config file.

## Dry Run

```powershell
powershell -ExecutionPolicy Bypass -File .\run.ps1 -Config .\jobs.image2.example.json -DryRun
```

## Generate

```powershell
powershell -ExecutionPolicy Bypass -File .\run.ps1 -Config .\jobs.image2.example.json
```

The tool writes PNG files and normalizes them to `800x800`.

## Config Shape

```json
{
  "model": "gpt-image-2",
  "baseUrl": "https://api.openai.com/v1",
  "outputDir": "../../outputs/my_product",
  "size": "1024x1024",
  "outputSize": 800,
  "quality": "medium",
  "outputFormat": "png",
  "concurrency": 2,
  "jobs": [
    {
      "name": "store_7_main",
      "prompt": "Your poster prompt...",
      "images": ["../../inputs/product/ref_01.png", "../../watermarks/store7.png"],
      "out": "store_7_skinora/01_main.png"
    }
  ]
}
```

If `images` is present, the tool uses the image edits endpoint. Otherwise it uses image generations.
