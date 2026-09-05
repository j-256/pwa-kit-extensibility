/*
 * Copyright (c) 2025, Salesforce, Inc.
 * All rights reserved.
 * SPDX-License-Identifier: BSD-3-Clause
 * For full license text, see the LICENSE file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

/*
 * Local development server entry, used by `npm start` in place of
 * `pwa-kit-dev start`.
 *
 * Why this exists: `pwa-kit-dev start` runs the SSR entry under `babel-node`,
 * which (like @babel/register) does not transpile `node_modules`. The
 * `@salesforce/*` runtime packages (retail-react-app, pwa-kit-runtime,
 * pwa-kit-react-sdk, commerce-sdk-react) ship unbundled ESM-syntax source whose
 * relative/subpath imports omit file extensions, expecting a bundler to resolve
 * them. Left untranspiled, Node 22.7+ auto-detects the ESM syntax and loads
 * those files as native ES modules, where extensionless specifiers are fatal
 * (e.g. ERR_MODULE_NOT_FOUND on `pwa-kit-runtime/ssr/server/httponly-cookie-config`).
 * The production build is unaffected because it uses webpack, which resolves the
 * extensions.
 *
 * The fix: configure @babel/register to transpile the `@salesforce/*` runtime
 * packages to CommonJS -- whose require() tolerates missing extensions -- while
 * leaving the pwa-kit-dev build tooling and all other node_modules ignored. Then
 * load the SSR entry, which starts the dev server itself.
 *
 * `--inspect` is available via the `start:inspect` script. To disable client HMR,
 * run with `HMR=false`
 */
const path = require('path')
const {getConfig} = require('@salesforce/pwa-kit-runtime/utils/ssr-config')

// Mirror the environment that `pwa-kit-dev start` derives from the resolved
// config (DEPLOY_TARGET selects config/<target>.js, else config/default.js)
const config = getConfig() || {}
process.env.MRT_ENABLE_HTTPONLY_SESSION_COOKIES = String(
    config.ssrParameters?.enableHttpOnlySessionCookies ?? false
)
if (config.ssrParameters?.envBasePath) {
    process.env.MRT_ENV_BASE_PATH = config.ssrParameters.envBasePath
}

const SEP = path.sep === '\\' ? '\\\\' : '/'
const inNodeModules = new RegExp(`node_modules${SEP}`)
const inSalesforce = new RegExp(`node_modules${SEP}@salesforce${SEP}`)
const isBuildTool = new RegExp(`node_modules${SEP}@salesforce${SEP}pwa-kit-dev${SEP}`)

require('@babel/register')({
    extensions: ['.js', '.jsx', '.ts', '.tsx'],
    ignore: [
        (filepath) => {
            // Transpile project source (outside node_modules)
            if (!inNodeModules.test(filepath)) return false
            // Do not transpile the build tool whose babel config we consume
            if (isBuildTool.test(filepath)) return true
            // Transpile the @salesforce/* runtime packages, ignore everything else
            return !inSalesforce.test(filepath)
        }
    ]
})

require('./overrides/app/ssr.js')
