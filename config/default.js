/*
 * Copyright (c) 2023, Salesforce, Inc.
 * All rights reserved.
 * SPDX-License-Identifier: BSD-3-Clause
 * For full license text, see the LICENSE file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */
/* eslint-disable @typescript-eslint/no-var-requires */
const sites = require('./sites.js')
const {parseSettings, validateOtpTokenLength} = require('./utils.js')

module.exports = {
    app: {
        mrtDataStore: {
            enabled: false
        },
        commerceAgent: parseSettings(process.env.COMMERCE_AGENT_SETTINGS) || {
            enabled: 'false',
            askAgentOnSearch: 'false',
            embeddedServiceName: '',
            embeddedServiceEndpoint: '',
            scriptSourceUrl: '',
            scrt2Url: '',
            salesforceOrgId: '',
            commerceOrgId: '',
            siteId: '',
            enableConversationContext: 'false',
            conversationContext: [],
            provider: 'miaw',
            cc_cdnVersion: '',
            commerceClientScriptSourceUrl: '',
            cc_esDeveloperName: '',
            cc_headerText: '',
            cc_disclaimerMarkdown: '',
            cc_dialogFullHeight: 'true',
            cc_dialogWidth: '420px',
            cc_widgetPosition: 'bottom-right',
            cc_showFab: 'false',
            cc_pagePush: 'false',
            cc_logoUrl: '',
            cc_isOpen: 'false',
            cc_isDevelopment: 'false',
            cc_enableEscalationToAgent: 'false',
            cc_enableDownloadTranscript: 'true',
            cc_overridesUrl: ''
        },
        url: {
            // Keep the default site and locale out of storefront paths
            locale: 'none',
            showBasePath: false,
            interpretPlusSignAsSpace: false
        },
        login: {
            tokenLength: validateOtpTokenLength(process.env.OTP_TOKEN_LENGTH),
            passwordless: {
                enabled: false,
                mode: 'email',
                landingPath: '/passwordless-login-landing'
            },
            social: {
                enabled: true,
                idps: ['google'],
                redirectURI: process.env.SOCIAL_LOGIN_REDIRECT_URI || '/social-callback'
            },
            resetPassword: {
                mode: 'email',
                landingPath: '/reset-password-landing'
            }
        },
        defaultSite: 'RefArchJ',
        sites,
        commerceAPI: {
            proxyPath: `/mobify/proxy/api`,
            parameters: {
                clientId: 'b6d89cf5-ed45-4c2b-a39c-d7ce93d99cc6',
                organizationId: 'f_ecom_bkwp_prd',
                shortCode: 'hzx11t3w',
                siteId: 'RefArchJ'
            }
        },
        einsteinAPI: {
            host: 'https://api.cquotient.com',
            einsteinId: '',
            siteId: '',
            isProduction: false
        },
        dataCloudAPI: {
            appSourceId: '',
            tenantId: ''
        },
        oneClickCheckout: {
            enabled: false
        },
        partialHydrationEnabled: false,
        pages: {
            cart: {
                groupBonusProductsWithQualifyingProduct: true
            },
            maintenancePage: {
                sharedMaintenancePage: true,
                cdnUrl: 'https://prd.cmp.cdn.commercecloud.salesforce.com',
                forwardedHost: ''
            }
        },
        storeLocatorEnabled: true,
        multishipEnabled: true,
        sfPayments: {
            enabled: false,
            sdkUrl: '',
            metadataUrl: ''
        },
        googleCloudAPI: {
            apiKey: process.env.GOOGLE_CLOUD_API_KEY
        }
    },
    externals: [],
    pageNotFoundURL: '/page-not-found',
    ssrEnabled: true,
    ssrOnly: ['ssr.js', 'ssr.js.map', 'node_modules/**/*.*'],
    ssrShared: ['static/ico/favicon.ico', '**/*.js', '**/*.js.map', '**/*.json'],
    ssrParameters: {
        ssrFunctionNodeVersion: '24.x',
        enableHttpOnlySessionCookies: false,
        proxyConfigs: [
            {
                host: 'hzx11t3w.api.commercecloud.salesforce.com',
                path: 'api'
            },
            {
                host: 'prd.cc.fad.bz',
                path: 'ocapi'
            }
        ]
    },
    custom: {
        imageHost: 'prd.cc.fad.bz'
    }
}
