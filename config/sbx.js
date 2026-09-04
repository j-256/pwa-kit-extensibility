/*
 * Copyright (c) 2023, Salesforce, Inc.
 * All rights reserved.
 * SPDX-License-Identifier: BSD-3-Clause
 * For full license text, see the LICENSE file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */
/* eslint-disable @typescript-eslint/no-var-requires */

// Config for the `sbx` Managed Runtime environment (DEPLOY_TARGET=sbx), backed
// by the zzcu_256 sandbox. Inherits from default.js (bkwp_prd), overriding only
// instance-specific values -- PWA Kit loads the first matching config file and
// does not merge across files, so default.js is spread in explicitly
const defaultConfig = require('./default.js')

module.exports = {
    ...defaultConfig,
    app: {
        ...defaultConfig.app,
        // zzcu_256 uses a private SLAS client; the secret is supplied at runtime
        // via PWA_KIT_SLAS_CLIENT_SECRET (set on the sbx MRT env, and locally for
        // dev). Set to false to switch this environment to a public PKCE client
        useSLASPrivateClient: true,
        commerceAPI: {
            ...defaultConfig.app.commerceAPI,
            parameters: {
                ...defaultConfig.app.commerceAPI.parameters,
                clientId: 'decafbad-c0de-4fed-8afe-feed5afecafe',
                organizationId: 'f_ecom_zzcu_256',
                shortCode: 'kv7kzm78',
                siteId: 'RefArchJ'
            }
        },
        pages: {
            ...defaultConfig.app.pages,
            maintenancePage: {
                ...defaultConfig.app.pages.maintenancePage,
                sharedMaintenancePage: false,
                cdnUrl: ''
            }
        }
    },
    ssrParameters: {
        ...defaultConfig.ssrParameters,
        // .dx. is acceptable only as a server-side proxy backend host; every
        // inbound/browser-facing host must use the .my. eCDN domain
        proxyConfigs: [
            {
                host: 'kv7kzm78.api.commercecloud.salesforce.com',
                path: 'api'
            },
            {
                host: 'zzcu-256.dx.commercecloud.salesforce.com',
                path: 'ocapi'
            }
        ]
    },
    custom: {
        ...defaultConfig.custom,
        imageHost: 'zzcu-256.my.commercecloud.salesforce.com'
    }
}
