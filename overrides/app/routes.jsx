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
import {routes as _routes, getDynamicRoutes} from '@salesforce/retail-react-app/app/routes'

const fallback = <Skeleton height="75vh" width="100%" />

// Custom pages
const Test = loadable(() => import('./pages/test'), {fallback})
const ProductSearch = loadable(() => import('./pages/product-search'), {fallback})

const PageNotFound = loadable(() => import('@salesforce/retail-react-app/app/pages/page-not-found'))

export default () => {
    const config = getConfig()
    const allRoutes = configureRoutes(
        [
            {path: '/test', component: Test, exact: true},
            {path: '/product-search', component: ProductSearch, exact: true},
            ..._routes,
            ...getDynamicRoutes(config)
        ],
        config,
        {ignoredRoutes: ['/callback'], fuzzyPathMatching: true}
    )

    return [...allRoutes, {path: '*', component: PageNotFound}]
}
