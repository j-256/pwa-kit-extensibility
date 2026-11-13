# PWA Kit Extensibility Storefront

This Salesforce B2C Commerce storefront extends the Retail React App through PWA Kit Template Extensibility. It keeps the upstream application as its base while adding project-specific routing, SSR integrations, storefront configuration, and translations.

The base template is Retail React App 11.0.0 with PWA Kit 3.22.0 and Commerce SDK React 6.0.0. For upgrades, review the copied SSR and app-provider overrides against the new template alongside the dependency change. The routes override consumes upstream `getDynamicRoutes` so feature-gated routes follow the template.

The main and vendor bundle budgets follow the Retail React App 11 baseline. This increases the previous budgets to accommodate the upgraded template; it does not represent a bundle-size optimization. Run `npm run test:max-file-size` to verify the production bundles against the limits in `package.json`.

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

GitHub Actions runs the full tests and production build on Node 24 for pull requests and pushes to `main`, excluding Markdown-only changes. To check the supported Node 22 minimum too, manually dispatch `CI` with `compatibility` enabled. Run that compatibility check before a release or a change to the supported runtime range. Both paths install the locked dependencies with `npm ci`.

The storefront listens on `http://localhost:3000` by default.

Storefront and site settings live in `config/default.js` and `config/sites.js`. Supply private SLAS client secrets and optional integration keys through environment variables. Never commit those values.

### Environment configuration

`npm start` loads local environment variables from git-ignored `.env` files before starting the dev server. Copy `.env.example` and fill in what you need.

- `.env` is always loaded; put `DEPLOY_TARGET` here to choose the default target for a bare `npm start` (e.g. `sbx`; an unset target resolves to `config/default.js`).
- `.env.<DEPLOY_TARGET>` is overlaid on top for target-specific values, so each backend can supply its own private SLAS client secret.

`${VAR}` references expand from your shell environment, so a secret like the SLAS client secret is referenced by name and never has to live in a file:

```sh
# .env
DEPLOY_TARGET=sbx

# .env.<target> (the var name embeds that target's backing instance)
PWA_KIT_SLAS_CLIENT_SECRET=${SLAS_PRIVATE_CLIENT_SECRET_<instance>}
```

Precedence per key: the files fill only what your environment has not already set, so a shell export or an inline `VAR=x npm start` wins over the files; among the files, `.env.<target>` overrides `.env`. `PWA_KIT_SLAS_CLIENT_SECRET` is the exception, always taking the file value over an ambient shell value so a stale export cannot shadow it. Switch targets per run with `DEPLOY_TARGET=default npm start`; see [Switching backend instances](#switching-backend-instances) for the token-cache caveat.

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

The build refreshes and compiles the translation catalogs before producing the deployment bundle. Commit changes to the source catalogs in `translations/` alongside the source or dependency updates that produced them. CI fails if the build changes tracked catalogs; run `npm run build-translations` and commit the refreshed files to resolve that failure.

The version-scoped `compression@<1.8.2` override replaces vulnerable copies, including PWA Kit development tooling's exact pin, with the patched release for [premature-response-close memory leaks](https://github.com/advisories/GHSA-vc2v-76pw-4v95). Remove the override when upstream dependencies no longer require affected versions and the regenerated lockfile remains patched.

The `body-parser`, `ip-address`, and version-scoped Zod overrides patch [compressed-body denial of service](https://github.com/advisories/GHSA-27r3-jxmh-p828), [IPv6 zone-identifier processing](https://github.com/advisories/GHSA-rxp7-6hxx-x8q5), and [oversized collection validation](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5). The Puppeteer override brings Lighthouse's browser tooling onto a Zod-compatible patched dependency tree. Review these overrides when upgrading upstream tooling; do not replace older Zod major versions indiscriminately.

### Transactional email

Email delivery is unconfigured. Passwordless login and guest order lookup are disabled, and password reset retains `mode: 'email'`; this setting alone does not establish working email delivery. The notification callback handlers reject requests while callback mode or registration verification is unconfigured.

Retail React App 11's callback email delivery uses the `app_pwakit_base` cartridge. Before enabling it, follow the [upstream cartridge setup](https://github.com/SalesforceCommerceCloud/pwa-kit/blob/v3.22.0/packages/template-retail-react-app/cartridges/app_pwakit_base/README.md), provision a dedicated private SLAS client scoped to `c_pwakit_notify`, and set `commerceAPI.parameters.notifyClientId` and the server-side `PWA_KIT_NOTIFY_SLAS_CLIENT_SECRET`. Keep the notification scope off shopper clients. Verify callback allowlists, actual email delivery, cookie forwarding for guest order lookup, and email-link paths against the storefront's prefixless URL configuration before enabling the features.

## Managed Runtime deployment

Build and upload a bundle to the Managed Runtime project named in `package.json`:

```sh
npm run push -- -m "Describe the bundle"
```

Use `-s` to select a different project. Deployment requires Runtime Admin access.

Deploy to a specific target and block until it goes live by adding `-t <target> -w` (e.g. `npm run push -- -t sbx -w -m "..."`). To check a target's current deployment state without pushing, run `npm run deploy-status -- <target>`, which prints the Managed Runtime state (`ACTIVE` once live). It reads the same `~/.mobify` credentials as `push`.

## Documentation

- [PWA Kit and Managed Runtime overview](https://developer.salesforce.com/docs/commerce/pwa-kit-managed-runtime/overview)
- [Template Extensibility](https://developer.salesforce.com/docs/commerce/pwa-kit-managed-runtime/guide/template-extensibility.html)
- [Configuration options](https://developer.salesforce.com/docs/commerce/pwa-kit-managed-runtime/guide/configuration-options.html)
- [Push and deploy bundles](https://developer.salesforce.com/docs/commerce/pwa-kit-managed-runtime/guide/pushing-and-deploying-bundles.html)

## License

BSD-3-Clause. See [LICENSE](LICENSE).
