# Weevil Extension

Chrome/Chromium Manifest V3 extension for capturing Weevil bug reports.

## Local Development

```bash
pnpm install
pnpm --filter @weevil/extension build
```

Load `dist/` as an unpacked extension:

1. Open `chrome://extensions`.
2. Enable Developer Mode.
3. Click Load unpacked.
4. Select `/Users/zakydfls/personal/weevil/apps/ext/dist`.

The default backend target is injected at build time. Development builds use
`http://localhost:4000/v1`; production builds use the production API URL.

## Production Build

```bash
pnpm --filter @weevil/extension build:prod
```

The production build:

- injects `https://prod-api.theweevil.space/v1` as the default API base URL
- injects `https://theweevil.space` as the dashboard URL
- migrates any previously stored API URL back to the current build's default
- minifies JavaScript bundles
- disables source maps
- writes Chrome Web Store ZIP output to `apps/ext/releases/weevil-extension-<version>.zip`

Override the production API target when needed:

```bash
pnpm --filter @weevil/extension build:prod -- \
  --api-base-url=https://api.example.com/v1 \
  --web-base-url=https://app.example.com
```

Upload the ZIP from `apps/ext/releases/` to the Chrome Web Store Developer Dashboard.

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
