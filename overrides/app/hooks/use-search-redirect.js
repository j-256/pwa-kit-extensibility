// SPDX-License-Identifier: BSD-3-Clause

import {useEffect, useRef, useState} from 'react'
import {useHistory, useLocation} from 'react-router-dom'
import {useAccessToken, useCommerceApi, useConfig} from '@salesforce/commerce-sdk-react'
import {getConfig} from '@salesforce/pwa-kit-runtime/utils/ssr-config'
import createLogger from '@salesforce/pwa-kit-runtime/utils/logger-factory'
import {useCorrelationId} from '@salesforce/pwa-kit-react-sdk/ssr/universal/hooks'
import {getRouterBasePath} from '@salesforce/pwa-kit-react-sdk/ssr/universal/utils'
import useMultiSite from '@salesforce/retail-react-app/app/hooks/use-multi-site'
import {createUrlTemplate} from '@salesforce/retail-react-app/app/utils/url'
import {useAppOrigin} from './use-app-origin'
import {resolveCommerceDestination} from '../utils/commerce-destination'

const MAPPING_TIMEOUT_MS = 5000
const logger = createLogger({packageName: 'pwa-search-redirect'})
const locationIdentity = ({key, pathname, search, hash}) =>
    JSON.stringify([key, pathname, search, hash])

const useSearchRedirect = ({query, searchResult, isPreviousData, isLoading, isSearch = true}) => {
    const location = useLocation()
    const history = useHistory()
    const {site, locale, buildUrl} = useMultiSite()
    const appOrigin = useAppOrigin()
    const {shopperSeo} = useCommerceApi()
    const {getTokenWhenReady} = useAccessToken()
    const {enableHttpOnlySessionCookies} = useConfig()
    const {correlationId} = useCorrelationId()
    const settings = getConfig().app.searchRedirects || {}
    const suggestions = searchResult?.searchPhraseSuggestions
    // Require a response for the visible keyword query so retained search data cannot redirect
    const eligible =
        isSearch &&
        !!query?.trim() &&
        new URLSearchParams(location.search).get('q') === query &&
        !isPreviousData &&
        !isLoading &&
        searchResult?.query === query &&
        suggestions?.c_isRedirect === true &&
        typeof suggestions.c_redirectUrl === 'string' &&
        !!suggestions.c_redirectUrl
    const entry = locationIdentity(location)
    // Bind each decision to a history entry as well as its search and destination context
    const decision = eligible
        ? JSON.stringify([entry, site.id, locale.id, query, suggestions.c_redirectUrl])
        : ''
    const latest = useRef()
    // Read fresh dependencies without restarting a decision when object identities change
    // Async work captures its context below and checks this ref before applying its result
    latest.current = {
        decision,
        entry,
        site,
        locale,
        buildUrl,
        appOrigin,
        settings,
        shopperSeo,
        getTokenWhenReady,
        enableHttpOnlySessionCookies,
        correlationId
    }
    const attemptRef = useRef()
    const [settled, setSettled] = useState(null)

    useEffect(() => {
        if (!decision) return
        const context = latest.current
        let attempt = attemptRef.current
        // Reuse the promise across effect resubscriptions, including Strict Mode replay
        if (attempt?.decision !== decision) {
            attempt = {decision, started: Date.now(), expired: false, handled: false}
            attemptRef.current = attempt
            const buildDestinationUrl = (path, siteRef, localeRef) => {
                const app = getConfig().app
                const targetLocale = context.site.l10n.supportedLocales.find(
                    ({id, alias}) => id === localeRef || alias === localeRef
                )
                // A nondefault locale needs an explicit URL representation to survive a reload
                if (
                    targetLocale.id !== context.site.l10n.defaultLocale &&
                    !['path', 'query_param'].includes(app.url?.locale)
                )
                    return null
                if (targetLocale.id === context.locale.id)
                    return context.buildUrl(path, siteRef, localeRef)
                return createUrlTemplate(app, siteRef, localeRef)(path, siteRef, localeRef)
            }
            const getUrlMapping = async (options) => {
                const token = await context.getTokenWhenReady()
                if (attempt.expired || latest.current.decision !== decision)
                    throw new Error('cancelled')
                return context.shopperSeo.getUrlMapping({
                    ...options,
                    headers: context.enableHttpOnlySessionCookies
                        ? {}
                        : {Authorization: `Bearer ${token}`}
                })
            }
            let timer
            // Bound token acquisition and mapping together; late results cannot navigate
            const timeout = new Promise((resolve) => {
                timer = setTimeout(() => {
                    attempt.expired = true
                    resolve({kind: 'fallback', reason: 'mapping-timeout'})
                }, MAPPING_TIMEOUT_MS)
            })
            attempt.promise = Promise.race([
                resolveCommerceDestination(suggestions.c_redirectUrl, {
                    ...context,
                    buildUrl: buildDestinationUrl,
                    commerceOrigins: context.settings.commerceOrigins,
                    externalOrigins: context.settings.externalOrigins,
                    getUrlMapping
                }).catch(() => ({kind: 'fallback', reason: 'invalid-mapping'})),
                timeout
            ]).finally(() => clearTimeout(timer))
        }
        let subscribed = true
        attempt.promise.then((result) => {
            // Discard stale or unmounted subscribers and handle each attempt only once
            if (
                !subscribed ||
                attempt.handled ||
                latest.current.decision !== decision ||
                locationIdentity(history.location) !== context.entry
            )
                return
            attempt.handled = true
            attempt.expired = true
            if (
                result.kind === 'internal' &&
                result.url === `${location.pathname}${location.search}${location.hash}`
            ) {
                result = {kind: 'fallback', reason: 'self-navigation'}
            }
            const diagnostic = {
                namespace: 'searchRedirect.resolve',
                additionalProperties: {
                    outcome: result.kind,
                    reason: result.reason,
                    status: result.status,
                    elapsedMs: Date.now() - attempt.started,
                    correlationId: context.correlationId
                }
            }
            if (result.kind === 'fallback') {
                logger.warn('Search redirect retained search results', diagnostic)
                setSettled(decision)
            } else {
                logger.info('Search redirect resolved', diagnostic)
                if (result.kind === 'external') window.location.replace(result.url)
                else if (result.localeId !== context.locale.id)
                    // Reload to initialize the app in the destination locale
                    window.location.replace(`${getRouterBasePath()}${result.url}`)
                else
                    history.replace(result.url, {
                        ...location.state,
                        directedFrom: `${location.pathname}${location.search}`
                    })
            }
        })
        return () => {
            subscribed = false
        }
    }, [decision])

    return {isResolving: !!decision && settled !== decision}
}

export default useSearchRedirect
