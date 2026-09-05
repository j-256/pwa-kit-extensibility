# PWA Kit Extensibility Storefront

This Salesforce B2C Commerce storefront extends the Retail React App through PWA Kit Template Extensibility. It keeps the upstream application as its base while adding project-specific routing, SSR integrations, storefront configuration, and translations.

## Requirements

- Node 22.9 or later on major 22, or Node 24
- npm 11.19
- Access to a compatible Salesforce B2C Commerce instance for live storefront data

## Local development

Install the locked dependency tree and start the development server:

```sh
nvm install
nvm use
npm ci
npm start
```

The checked-in `.nvmrc` selects the latest installed Node 24 release. npm rejects install, CI, and script commands when the active Node version is outside the supported range in `package.json`; the package metadata separately pins the expected npm release.

The storefront listens on `http://localhost:3000` by default.

Storefront and site settings live in `config/default.js` and `config/sites.js`. Supply credentials such as Marketing Cloud secrets and optional integration keys through environment variables. Never commit those values.

### Switching backend instances

The shopper login SDK caches its SLAS access and refresh tokens in the browser keyed by the storefront's site ID, not by the backend instance. If you repoint the dev server at a different B2C Commerce instance while reusing the same browser profile, and both configs share a site ID, the SDK keeps sending the previous instance's cached token. That token is valid but belongs to the wrong instance, so Shopper API calls proxied through `/mobify/proxy/api` return `403 Forbidden` while the page itself still loads.

To recover, clear site data for `http://localhost:3000` (DevTools > Application > Clear site data) and reload, which mints a fresh token for the current instance; using a separate browser profile per instance avoids the collision entirely. A `403` here means a valid token aimed at the wrong instance, which is distinct from a `401`, which means a genuine authentication failure worth investigating on its own.

## Project structure

- `overrides/` contains components, pages, routes, static assets, and SSR behavior layered onto the Retail React App
- `config/` contains storefront, site, proxy, and Managed Runtime settings
- `translations/` contains source message catalogs; see [the localization guide](translations/README.md)
- `worker/` contains the Managed Runtime worker entry point

## Verification

Run the supported checks before committing:

```sh
npm run lint
npm test
npm run build
```

The build refreshes and compiles the translation catalogs before producing the deployment bundle.

## Managed Runtime deployment

Build and upload a bundle to the Managed Runtime project named in `package.json`:

```sh
npm run push -- -m "Describe the bundle"
```

Use `-s` to select a different project. Deployment requires Runtime Admin access.

## Documentation

- [PWA Kit and Managed Runtime overview](https://developer.salesforce.com/docs/commerce/pwa-kit-managed-runtime/overview)
- [Template Extensibility](https://developer.salesforce.com/docs/commerce/pwa-kit-managed-runtime/guide/template-extensibility.html)
- [Configuration options](https://developer.salesforce.com/docs/commerce/pwa-kit-managed-runtime/guide/configuration-options.html)
- [Push and deploy bundles](https://developer.salesforce.com/docs/commerce/pwa-kit-managed-runtime/guide/pushing-and-deploying-bundles.html)

## License

BSD-3-Clause. See [LICENSE](LICENSE).
