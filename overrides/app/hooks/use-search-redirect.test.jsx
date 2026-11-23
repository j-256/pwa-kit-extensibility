import React from 'react'
import {act, renderHook, waitFor} from '@testing-library/react'
import {Router} from 'react-router-dom'
import {createMemoryHistory} from 'history'
import {getConfig} from '@salesforce/pwa-kit-runtime/utils/ssr-config'
import useSearchRedirect from './use-search-redirect'

const mockMap = jest.fn()
const mockWarn = jest.fn()
const mockInfo = jest.fn()
let mockRouterBasePath = ''
jest.mock('@salesforce/pwa-kit-react-sdk/ssr/universal/utils', () => ({
    ...jest.requireActual('@salesforce/pwa-kit-react-sdk/ssr/universal/utils'),
    getRouterBasePath: () => mockRouterBasePath
}))
const mockToken = jest.fn(async () => 'shopper-token')
const site = {id: 'ExampleSite', l10n: {defaultLocale: 'en-US', supportedLocales: [{id: 'en-US'}]}}
const locale = {id: 'en-US'}
const buildUrl = (path) => path
jest.mock('@salesforce/commerce-sdk-react', () => ({
    useCommerceApi: () => ({shopperSeo: {getUrlMapping: mockMap}}),
    useAccessToken: () => ({getTokenWhenReady: mockToken}),
    useConfig: () => ({enableHttpOnlySessionCookies: false})
}))
jest.mock('@salesforce/retail-react-app/app/hooks/use-multi-site', () => () => ({
    site,
    locale,
    buildUrl
}))
jest.mock('./use-app-origin', () => ({useAppOrigin: () => 'https://app.example'}))
jest.mock('@salesforce/pwa-kit-react-sdk/ssr/universal/hooks', () => ({
    useCorrelationId: () => ({correlationId: 'test-correlation'})
}))
jest.mock('@salesforce/pwa-kit-runtime/utils/logger-factory', () => () => ({
    warn: (...args) => mockWarn(...args),
    info: (...args) => mockInfo(...args)
}))
jest.mock('@salesforce/pwa-kit-runtime/utils/ssr-config', () => ({getConfig: jest.fn()}))

const response = (url = '/s/ExampleSite/en-us/item.html') => ({
    query: 'sample',
    hits: [{productId: 'retained'}],
    total: 1,
    searchPhraseSuggestions: {c_isRedirect: true, c_redirectUrl: url}
})
let history
const setup = (props = {}, strict = false) => {
    history = createMemoryHistory({
        initialEntries: ['/before', '/search?q=sample'],
        initialIndex: 1
    })
    const wrapper = ({children}) => (
        <Router history={history}>
            {strict ? <React.StrictMode>{children}</React.StrictMode> : children}
        </Router>
    )
    return renderHook((values) => useSearchRedirect(values), {
        initialProps: {query: 'sample', searchResult: response(), ...props},
        wrapper
    })
}

beforeEach(() => {
    jest.clearAllMocks()
    mockRouterBasePath = ''
    getConfig.mockReturnValue({
        app: {searchRedirects: {commerceOrigins: ['https://commerce.example']}}
    })
    mockMap.mockResolvedValue({resourceType: 'product', resourceId: 'target'})
})

test('replaces the transient search history entry and keeps route state', async () => {
    const {result} = setup()
    expect(result.current.isResolving).toBe(true)
    await waitFor(() => expect(history.location.pathname).toBe('/product/target'))
    expect(history.action).toBe('REPLACE')
    expect(history.location.state.directedFrom).toBe('/search?q=sample')
    act(() => history.goBack())
    expect(history.location.pathname).toBe('/before')
})

test.each([
    {isPreviousData: true},
    {query: ''},
    {query: '   '},
    {isLoading: true},
    {isSearch: false},
    {searchResult: {...response(), query: 'different'}},
    {searchResult: {hits: []}}
])('does not navigate without eligible current keyword metadata: %j', async (props) => {
    const {result} = setup(props)
    await act(async () => {})
    expect(history.location.pathname).toBe('/search')
    expect(result.current.isResolving).toBe(false)
    expect(mockMap).not.toHaveBeenCalled()
})

test('ignores a stale mapping after the query changes', async () => {
    let complete
    mockMap.mockReturnValue(
        new Promise((resolve) => {
            complete = resolve
        })
    )
    const {rerender, result} = setup()
    await waitFor(() => expect(mockMap).toHaveBeenCalledTimes(1))
    act(() => history.push('/search?q=ordinary'))
    rerender({
        query: 'ordinary',
        searchResult: {query: 'ordinary', hits: [{productId: 'retained'}]}
    })
    await act(async () => complete({resourceType: 'product', resourceId: 'stale'}))
    expect(history.location.search).toBe('?q=ordinary')
    expect(result.current.isResolving).toBe(false)
})

test('rejects a stale completion even before React commits the new route', async () => {
    let complete
    mockMap.mockReturnValue(
        new Promise((resolve) => {
            complete = resolve
        })
    )
    setup()
    await waitFor(() => expect(mockMap).toHaveBeenCalledTimes(1))
    await act(async () => {
        history.push('/cart')
        complete({resourceType: 'product', resourceId: 'stale'})
    })
    expect(history.location.pathname).toBe('/cart')
})

test('deduplicates mapping and replacement across effect replay and rerenders', async () => {
    const {rerender} = setup({}, true)
    await waitFor(() => expect(history.location.pathname).toBe('/product/target'))
    rerender({query: 'sample', searchResult: response()})
    await act(async () => {})
    expect(mockMap).toHaveBeenCalledTimes(1)
    expect(mockInfo).toHaveBeenCalledTimes(1)
})

test('retains the page after errors and emits only bounded diagnostic fields', async () => {
    mockMap.mockRejectedValue({response: {status: 403}, message: 'private phrase URL credentials'})
    const {result, rerender} = setup()
    await waitFor(() => expect(result.current.isResolving).toBe(false))
    expect(history.location.pathname).toBe('/search')
    expect(mockWarn).toHaveBeenCalledTimes(1)
    const diagnostic = JSON.stringify(mockWarn.mock.calls)
    expect(diagnostic).toContain('mapping-error')
    expect(diagnostic).toContain('403')
    expect(diagnostic).toContain('test-correlation')
    expect(diagnostic).not.toMatch(/sample|item.html|private phrase|shopper-token/)
    rerender({query: 'sample', searchResult: response()})
    await act(async () => {})
    expect(mockMap).toHaveBeenCalledTimes(1)
})

test('bounds slow mapping and ignores completion after timeout', async () => {
    jest.useFakeTimers()
    let complete
    mockMap.mockReturnValue(
        new Promise((resolve) => {
            complete = resolve
        })
    )
    try {
        const {result} = setup()
        await act(async () => {})
        await act(async () => {
            jest.advanceTimersByTime(5000)
        })
        expect(result.current.isResolving).toBe(false)
        expect(history.location.pathname).toBe('/search')
        await act(async () => complete({resourceType: 'product', resourceId: 'late'}))
        expect(history.location.pathname).toBe('/search')
        expect(JSON.stringify(mockWarn.mock.calls)).toContain('mapping-timeout')
    } finally {
        jest.useRealTimers()
    }
})

test('does not navigate after unmount', async () => {
    let complete
    mockMap.mockReturnValue(
        new Promise((resolve) => {
            complete = resolve
        })
    )
    const {unmount} = setup()
    await waitFor(() => expect(mockMap).toHaveBeenCalledTimes(1))
    unmount()
    await act(async () => complete({resourceType: 'product', resourceId: 'late'}))
    expect(history.location.pathname).toBe('/search')
})

test('does not convert an untrusted origin into a local route', async () => {
    const {result} = setup({
        searchResult: response('https://unknown.example/s/ExampleSite/item.html')
    })
    await waitFor(() => expect(result.current.isResolving).toBe(false))
    expect(history.location.pathname).toBe('/search')
    expect(mockMap).not.toHaveBeenCalled()
})

test('waits for authentication but never navigates if the query changes meanwhile', async () => {
    let authenticate
    mockToken.mockReturnValueOnce(
        new Promise((resolve) => {
            authenticate = resolve
        })
    )
    const {rerender} = setup()
    act(() => history.push('/search?q=ordinary'))
    rerender({query: 'ordinary', searchResult: {query: 'ordinary', hits: []}})
    await act(async () => authenticate('fresh-token'))
    expect(history.location.search).toBe('?q=ordinary')
    expect(mockMap).not.toHaveBeenCalled()
})

test('uses browser history replacement only for explicitly allowed external targets', async () => {
    const originalLocation = window.location
    const replace = jest.fn()
    delete window.location
    window.location = {replace}
    try {
        getConfig.mockReturnValue({
            app: {searchRedirects: {externalOrigins: ['https://partner.example']}}
        })
        setup({searchResult: response('https://partner.example/offer?x=1#details')})
        await waitFor(() =>
            expect(replace).toHaveBeenCalledWith('https://partner.example/offer?x=1#details')
        )
        expect(history.location.pathname).toBe('/search')
        expect(mockMap).not.toHaveBeenCalled()
    } finally {
        window.location = originalLocation
    }
})

test('reloads a different destination locale and preserves the router base path', async () => {
    site.l10n.supportedLocales.push({id: 'fr-FR'})
    getConfig.mockReturnValue({
        app: {
            defaultSite: site.id,
            sites: [site],
            url: {locale: 'query_param', showDefaults: false},
            searchRedirects: {}
        }
    })
    const originalLocation = window.location
    const replace = jest.fn()
    delete window.location
    window.location = {replace}
    mockRouterBasePath = '/shop'
    try {
        setup({searchResult: response('/s/ExampleSite/fr_FR/robe.html')})
        await waitFor(() =>
            expect(replace).toHaveBeenCalledWith('/shop/product/target?locale=fr-FR')
        )
        expect(history.location.pathname).toBe('/search')
    } finally {
        site.l10n.supportedLocales.pop()
        window.location = originalLocation
    }
})

test('retains search when a destination locale has no configured URL representation', async () => {
    site.l10n.supportedLocales.push({id: 'fr-FR'})
    getConfig.mockReturnValue({app: {url: {locale: 'none'}, searchRedirects: {}}})
    try {
        const {result} = setup({searchResult: response('/s/ExampleSite/fr_FR/robe.html')})
        await waitFor(() => expect(result.current.isResolving).toBe(false))
        expect(history.location.pathname).toBe('/search')
        expect(JSON.stringify(mockWarn.mock.calls)).toContain('unsupported-locale-route')
    } finally {
        site.l10n.supportedLocales.pop()
    }
})
