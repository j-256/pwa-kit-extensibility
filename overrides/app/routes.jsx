/*
 * Copyright (c) 2021, salesforce.com, inc.
 * All rights reserved.
 * SPDX-License-Identifier: BSD-3-Clause
 * For full license text, see the LICENSE file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

import React from 'react'
import loadable from '@loadable/component'
import {getConfig} from '@salesforce/pwa-kit-runtime/utils/ssr-config'

// Components
import {Skeleton} from '@salesforce/retail-react-app/app/components/shared/ui'
import {configureRoutes} from '@salesforce/retail-react-app/app/utils/routes-utils'
import {routes as _routes} from '@salesforce/retail-react-app/app/routes'

const fallback = <Skeleton height="75vh" width="100%" />

// Custom pages
const Test = loadable(() => import('./pages/test'), {fallback})
const ProductSearch = loadable(() => import('./pages/product-search'), {fallback})

// Base pages for config-driven routes (not included in the named routes export)
const Login = loadable(() => import('@salesforce/retail-react-app/app/pages/login'), {fallback})
const ResetPassword = loadable(() => import('@salesforce/retail-react-app/app/pages/reset-password'), {fallback})
const SocialLoginRedirect = loadable(() => import('@salesforce/retail-react-app/app/pages/social-login-redirect'), {fallback})
const PageNotFound = loadable(() => import('@salesforce/retail-react-app/app/pages/page-not-found'))

export default () => {
    const config = getConfig()
    const loginConfig = config?.app?.login

    // These routes are config-driven and must be replicated here because the
    // base routes.jsx only adds them in its default export, which we override
    const dynamicRoutes = [
        loginConfig?.resetPassword?.landingPath && {
            path: loginConfig.resetPassword.landingPath,
            component: ResetPassword,
            exact: true
        },
        loginConfig?.passwordless?.enabled &&
            loginConfig?.passwordless?.landingPath && {
                path: loginConfig.passwordless.landingPath,
                component: Login,
                exact: true
            },
        loginConfig?.social?.enabled &&
            loginConfig?.social?.redirectURI && {
                path: loginConfig.social.redirectURI,
                component: SocialLoginRedirect,
                exact: true
            }
    ].filter(Boolean)

    const allRoutes = configureRoutes(
        [
            {path: '/test', component: Test, exact: true},
            {path: '/product-search', component: ProductSearch, exact: true},
            ..._routes,
            ...dynamicRoutes
        ],
        config,
        {ignoredRoutes: ['/callback'], fuzzyPathMatching: true}
    )

    return [...allRoutes, {path: '*', component: PageNotFound}]
}
