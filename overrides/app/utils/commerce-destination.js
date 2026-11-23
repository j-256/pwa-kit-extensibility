// SPDX-License-Identifier: BSD-3-Clause

import {categoryUrlBuilder, productUrlBuilder} from '@salesforce/retail-react-app/app/utils/url'

const MAX_REDIRECT_HOPS = 5
const REDIRECT_STATUSES = new Set([301, 302, 307])
// eslint-disable-next-line no-control-regex -- Reject controls before URL parsing
const UNSAFE_CHARACTERS = /[\u0000-\u0020\u007f\\]/
// eslint-disable-next-line no-control-regex -- Reject encoded controls while preserving encoded spaces
const UNSAFE_DECODED_CHARACTERS = /[\u0000-\u001f\u007f\\]/
const SEARCH_PATH = /^(?:search|product-search)(?:\/|$)/i
const PIPELINE_PATH = /^(?:on\/demandware\.|[^/]*-(?:Show|Start|ShowSearch)(?:\/|$))/i
const fallback = (reason, details = {}) => ({kind: 'fallback', reason, ...details})
const localeKey = (value) => value?.replace(/_/g, '-').toLowerCase()

// Keep query/fragment state separate from the encoded SEO segment
export const normalizeCommerceDestination = (destination, context, baseUrl = context.appOrigin) => {
    if (
        typeof destination !== 'string' ||
        !destination ||
        UNSAFE_CHARACTERS.test(destination) ||
        destination.startsWith('//')
    ) {
        return fallback('unsafe-url')
    }
    let url
    try {
        if (UNSAFE_DECODED_CHARACTERS.test(decodeURI(destination))) return fallback('unsafe-url')
        url = new URL(destination, baseUrl)
    } catch {
        return fallback('unsafe-url')
    }
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) {
        return fallback('unsafe-url')
    }
    const {appOrigin, commerceOrigins = [], externalOrigins = [], site} = context
    const internalOrigin = url.origin === appOrigin || commerceOrigins.includes(url.origin)
    if (!internalOrigin) {
        return url.protocol === 'https:' && externalOrigins.includes(url.origin)
            ? {kind: 'external', url: url.href}
            : fallback('untrusted-origin')
    }
    let segments = url.pathname.slice(1).split('/')
    if (segments[0] === 's') {
        if (decodeURIComponent(segments[1] || '') !== site.id) return fallback('unsupported-site')
        segments = segments.slice(2)
    }
    let locale = context.locale
    const prefix = decodeURIComponent(segments[0] || '')
    const destinationLocale = site.l10n.supportedLocales.find(
        ({id, alias}) => localeKey(prefix) === localeKey(id) || (alias && prefix === alias)
    )
    if (destinationLocale) {
        locale = destinationLocale
        segments = segments.slice(1)
    }
    const urlSegment = segments.join('/')
    if (SEARCH_PATH.test(urlSegment)) return fallback('search-loop')
    if (!urlSegment || PIPELINE_PATH.test(urlSegment)) return fallback('unsupported-path')
    return {kind: 'commerce', url, urlSegment, locale}
}

// Platforms may already include copied/additional parameters in destinationUrl
const appendMissingPairs = (url, params) => {
    const countPairs = (entries) => {
        const counts = new Map()
        for (const pair of entries) {
            const key = JSON.stringify(pair)
            counts.set(key, (counts.get(key) || 0) + 1)
        }
        return counts
    }
    const existing = countPairs(url.searchParams)
    const incoming = new Map()
    const raw = typeof params === 'string' ? params.replace(/^\?/, '') : params.toString()
    for (const pair of raw.split('&').filter(Boolean)) {
        const decoded = new URLSearchParams(pair).entries().next().value
        const key = JSON.stringify(decoded)
        const count = (incoming.get(key) || 0) + 1
        incoming.set(key, count)
        if (count > (existing.get(key) || 0)) {
            url.search += `${url.search ? '&' : '?'}${pair}`
        }
    }
}

const redirectDestination = (mapping, source, context) => {
    if (!REDIRECT_STATUSES.has(Number(mapping.statusCode))) return fallback('unsupported-status')
    const target = normalizeCommerceDestination(mapping.destinationUrl, context, source.url)
    if (target.kind === 'fallback') return target
    const url = target.kind === 'external' ? new URL(target.url) : target.url
    if (mapping.copySourceParams === true) appendMissingPairs(url, source.url.search)
    if (mapping.additionalUrlParams != null) {
        if (typeof mapping.additionalUrlParams !== 'string') return fallback('invalid-mapping')
        appendMissingPairs(url, mapping.additionalUrlParams)
    }
    if (!url.hash) url.hash = source.url.hash
    return {...target, url}
}

const resourceRoute = (mapping, target, context) => {
    const type = typeof mapping.resourceType === 'string' ? mapping.resourceType.toLowerCase() : ''
    if (!['product', 'category'].includes(type)) return fallback('unsupported-resource')
    if (typeof mapping.resourceId !== 'string' || !mapping.resourceId.trim()) {
        return fallback('missing-resource')
    }
    const builder = type === 'product' ? productUrlBuilder : categoryUrlBuilder
    let path
    try {
        path = `${builder({id: ''})}${encodeURIComponent(mapping.resourceId)}`
    } catch {
        return fallback('invalid-resource')
    }
    const url = new URL(target.url)
    if (type === 'category' && mapping.refinements) {
        if (typeof mapping.refinements !== 'object' || Array.isArray(mapping.refinements)) {
            return fallback('invalid-refinements')
        }
        for (const [attribute, value] of Object.entries(mapping.refinements)) {
            if (typeof value !== 'string') return fallback('invalid-refinements')
            appendMissingPairs(url, new URLSearchParams([['refine', `${attribute}=${value}`]]))
        }
    }
    path += url.search + url.hash
    const route = context.buildUrl(
        path,
        context.site.alias || context.site.id,
        target.locale.alias || target.locale.id
    )
    return typeof route === 'string'
        ? {kind: 'internal', url: route, localeId: target.locale.id}
        : fallback('unsupported-locale-route')
}

// Inject the authenticated mapper so incoming-path resolution can reuse this boundary
export const resolveCommerceDestination = async (destination, context) => {
    let target = normalizeCommerceDestination(destination, context)
    const visited = new Set()
    for (let hop = 0; hop < MAX_REDIRECT_HOPS; hop++) {
        if (target.kind === 'fallback' || target.kind === 'external') return target
        const key = `${target.locale.id}:${target.urlSegment}`
        if (visited.has(key)) return fallback('redirect-loop')
        visited.add(key)
        let mapping
        try {
            mapping = await context.getUrlMapping({
                parameters: {
                    siteId: context.site.id,
                    locale: target.locale.id,
                    urlSegment: target.urlSegment
                }
            })
        } catch (error) {
            const status = error?.response?.status
            return fallback('mapping-error', Number.isInteger(status) ? {status} : {})
        }
        if (!mapping || typeof mapping !== 'object') return fallback('missing-mapping')
        if (mapping.statusCode != null || mapping.destinationUrl != null) {
            const redirected = redirectDestination(mapping, target, {
                ...context,
                locale: target.locale
            })
            if (redirected.kind === 'fallback') return redirected
            if (redirected.kind === 'external') return {...redirected, url: redirected.url.href}
            target = redirected
        }
        if (mapping.resourceType != null) return resourceRoute(mapping, target, context)
        if (!mapping.destinationUrl) return fallback('missing-mapping')
    }
    return fallback('redirect-limit')
}
