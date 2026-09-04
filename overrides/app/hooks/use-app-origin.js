/*
 * Copyright (c) 2024, Salesforce, Inc.
 * All rights reserved.
 * SPDX-License-Identifier: BSD-3-Clause
 * For full license text, see the LICENSE file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */

/**
 * Override of the retail-react-app use-app-origin hook. The base calls useOrigin
 * with fromXForwardedHeader: false, pinning the app origin to the fixed env host
 * (EXTERNAL_DOMAIN_NAME / the MRT hostname). Setting it true makes every
 * useAppOrigin consumer honor the X-Forwarded-Host origin, so a custom domain
 * fronting the CDN is used for canonical URLs, redirects and other origin-derived
 * URLs; useOrigin falls back to the env origin when no X-Forwarded-Host is present
 */
import {useOrigin} from '@salesforce/pwa-kit-react-sdk/ssr/universal/hooks'

export const useAppOrigin = () => useOrigin({fromXForwardedHeader: true})
