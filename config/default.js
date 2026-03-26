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
            conversationContext: []
        },
        url: {
            // v9 default: site: 'path',
            // v9 default: locale: 'path',
            // v9 default: showDefaults: true,
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
                // v9 default: enabled: false,
                enabled: true,
                // v9 default: idps: ['google', 'apple'],
                idps: ['google'],
                redirectURI: process.env.SOCIAL_LOGIN_REDIRECT_URI || '/social-callback'
            },
            resetPassword: {
                mode: 'email',
                landingPath: '/reset-password-landing'
            }
        },
        // v9 default: defaultSite: 'RefArchGlobal',
        defaultSite: 'RefArchJ',
        // v9 default:
        // siteAliases: {
        //     RefArch: 'us',
        //     RefArchGlobal: 'global'
        // },
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
    ssrShared: [
        'static/ico/favicon.ico',
        'static/robots.txt',
        '**/*.js',
        '**/*.js.map',
        '**/*.json'
    ],
    ssrParameters: {
        ssrFunctionNodeVersion: '24.x',
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
