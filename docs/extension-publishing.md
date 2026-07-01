# Weevil Chrome Extension Publishing

## Build Artifact

Create the production ZIP:

```bash
pnpm --filter @weevil/extension build:prod
```

Output:

```text
apps/ext/releases/weevil-extension-0.1.0.zip
```

Use this ZIP for Chrome Web Store upload. It contains `manifest.json` at the ZIP
root, minified bundles, generated icons, and no source maps.

The default production API base URL is `https://api-weevil.centurycode.id/v1`.
Previously stored local/prod default URLs are migrated to the current build's
default when the extension runs; custom API URLs from the settings page are kept.

Override the API base URL if production changes:

```bash
pnpm --filter @weevil/extension build:prod -- \
  --api-base-url=https://api-weevil.centurycode.id/v1 \
  --web-base-url=https://weevil.centurycode.id
```

## Pre-Submit Smoke Test

1. Run `pnpm --filter @weevil/extension build:prod`.
2. Open `chrome://extensions`.
3. Enable Developer Mode.
4. Click Load unpacked.
5. Select `apps/ext/dist`.
6. Log in to the Weevil dashboard in the same Chrome profile.
7. Start capture from the dashboard or extension popup.
8. Verify screenshot, recording, console logs, network events, and stop capture.
9. Confirm the report appears in production dashboard.

## Chrome Web Store Submission

1. Register or open the Chrome Web Store Developer Dashboard.
2. Add new item.
3. Upload `apps/ext/releases/weevil-extension-0.1.0.zip`.
4. Complete listing details: name, description, category, language, support
   contact, icon, and screenshots.
5. Complete privacy practices.
6. Add permission justifications.
7. Start as Unlisted for beta validation.
8. Move to Public after production smoke tests pass.

## Permission Justification Drafts

Use concise descriptions like these when Chrome asks why permissions are needed:

```text
activeTab: Allows the user to explicitly capture the currently selected tab only
after they start a Weevil capture.

tabs: Reads the active tab URL and title to attach page context to the bug report.

scripting: Injects the Weevil capture bridge into the active page so user actions,
runtime errors, and DOM context can be recorded during an active capture.

tabCapture: Records the active tab screen when the user starts a capture.

offscreen: Maintains the tab recording pipeline required by Manifest V3 service
workers.

webRequest: Captures request metadata for the active capture so developers can
debug failed API calls and frontend/network issues.

debugger: Captures console logs and runtime events while recording. The extension
attaches only during an explicit user-started capture and detaches when capture
stops.

storage: Stores extension settings, capture state, and upload progress locally.

alarms: Flushes telemetry batches periodically while a capture is active.

<all_urls>: Weevil is a bug-reporting tool for arbitrary websites and local apps,
so capture must work on the page where the user starts recording.
```

## Privacy Disclosure Notes

Disclose that Weevil can collect the following only while a user actively records:

- screen recording and screenshots
- page URL and title
- console logs and runtime errors
- network request and response metadata
- user actions such as click, input, keypress, navigation, and scroll
- DOM/performance telemetry

Do not claim the extension collects data silently or continuously. The intended
behavior is user-initiated capture only.
