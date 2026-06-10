# Weevil Extension

Chrome/Chromium Manifest V3 extension for capturing Weevil bug reports.

## Local Development

```bash
pnpm install
pnpm build
```

Load `dist/` as an unpacked extension:

1. Open `chrome://extensions`.
2. Enable Developer Mode.
3. Click Load unpacked.
4. Select `/Users/zakydfls/personal/weevil/weevil-ext/dist`.

The default backend target is `http://localhost:4000/v1`. Change it from the extension settings page when needed.

## Captured Data

- tab recording artifact
- report and capture session metadata
- console logs
- fetch/XHR network requests
- page actions
- runtime errors and unhandled rejections
- performance/resource/navigation entries
- DOM focus/mutation events
- backend trace entries inferred from page network activity
