# Project cover

The cover shows the built storefront's Womens category at 1440 by 1000 pixels. Capture uses the upstream Retail React App's public RefArch demo catalog and a fresh guest browser, declines optional tracking, and waits for the visible product images and fonts.

```sh
npm ci
npx playwright install chromium
npm run capture:cover
```

The command requires a free localhost port 3000 and network access to the public reference storefront. It selects `config/cover.js`, suppresses private `.env` loading and browser auto-opening, and uses public-client SLAS authentication. It does not require a private client secret. The regular application also reads `app.useSLASPrivateClient`, so its configured authentication mode remains authoritative.

CI captures after the existing verification jobs and uploads the result for review. A successful build on `main` commits a changed `docs/screenshots/cover.png`; pull requests only produce the artifact. Scheduled and manual CI runs can refresh the image without a source change. A superseded source build cannot overwrite a newer revision's cover. Capture failures, including public demo unavailability, fail CI and preserve the committed image.

The project cover is rendered at 4x pixel density while preserving its logical viewport, so enlarged previews retain more detail. Higher density does not increase the displayed text size; use zoom to inspect small labels.
