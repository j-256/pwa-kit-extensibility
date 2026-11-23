import {resolveCommerceDestination, normalizeCommerceDestination} from './commerce-destination'

const site = {
    id: 'ExampleSite',
    l10n: {supportedLocales: [{id: 'en-US'}, {id: 'fr-FR', alias: 'fr'}]}
}
const context = {
    site,
    locale: {id: 'en-US'},
    appOrigin: 'https://app.example',
    commerceOrigins: ['https://commerce.example'],
    externalOrigins: ['https://partner.example'],
    buildUrl: (path, siteRef, localeRef) => `/shop/${siteRef}/${localeRef}${path}`
}
const resolve = (destination, mapping, overrides = {}) =>
    resolveCommerceDestination(destination, {
        ...context,
        getUrlMapping: async () => mapping,
        ...overrides
    })

test('strips only the configured site and locale prefixes without decoding the SEO path', () => {
    expect(
        normalizeCommerceDestination(
            'https://commerce.example/s/ExampleSite/en-us/new%20arrivals/?a=%26#top',
            context
        )
    ).toMatchObject({
        kind: 'commerce',
        urlSegment: 'new%20arrivals/',
        locale: {id: 'en-US'},
        url: expect.objectContaining({search: '?a=%26', hash: '#top'})
    })
    expect(normalizeCommerceDestination('/s/OtherSite/product.html', context).reason).toBe(
        'unsupported-site'
    )
})

test.each(['product', 'PRODUCT'])(
    'maps %s and preserves encoded resource ID and destination state',
    async (resourceType) => {
        expect(
            await resolve('/s/ExampleSite/en-us/item.html?color=red&x=%26#details', {
                resourceType,
                resourceId: 'item /?#%'
            })
        ).toMatchObject({
            kind: 'internal',
            url: '/shop/ExampleSite/en-US/product/item%20%2F%3F%23%25?color=red&x=%26#details'
        })
    }
)

test.each(['category', 'CATEGORY'])(
    'maps %s with refinements and a known alternate locale',
    async (resourceType) => {
        expect(
            await resolve('/s/ExampleSite/fr_FR/nouveaut%C3%A9s/', {
                resourceType,
                resourceId: 'new arrivals',
                refinements: {color: 'Blue & Red'}
            })
        ).toMatchObject({
            kind: 'internal',
            url: '/shop/ExampleSite/fr/category/new%20arrivals?refine=color%3DBlue+%26+Red'
        })
    }
)

test('passes the normalized path, site and effective locale separately to the mapper', async () => {
    const observed = []
    const result = await resolve('/s/ExampleSite/fr_FR/nouveaut%C3%A9s/?x=1#title', null, {
        getUrlMapping: async (options) => {
            observed.push(options.parameters)
            return {resourceType: 'product', resourceId: 'sample'}
        }
    })
    expect(observed).toEqual([
        {siteId: 'ExampleSite', locale: 'fr-FR', urlSegment: 'nouveaut%C3%A9s/'}
    ])
    expect(result.url).toBe('/shop/ExampleSite/fr/product/sample?x=1#title')
})

test.each([
    'javascript:alert(1)',
    'data:text/html,hello',
    '//commerce.example/path',
    'https://user:pass@commerce.example/path',
    'https://unknown.example/s/ExampleSite/item.html',
    'https://commerce.example.evil.example/s/ExampleSite/item.html',
    '/bad\\path',
    '/bad%ZZ',
    '/s/ExampleSite/%0aheader',
    '/s/ExampleSite/en-us/Search-Show?q=next',
    ''
])('retains search for an unsafe or unsupported destination: %s', async (destination) => {
    expect(
        await resolve(destination, {resourceType: 'product', resourceId: 'ignored'})
    ).toMatchObject({kind: 'fallback'})
})

test('allows only explicitly allowed external HTTPS origins without mapping them', async () => {
    expect(
        await resolve('https://partner.example/s/ExampleSite/offer?a=1#top', null)
    ).toMatchObject({kind: 'external', url: 'https://partner.example/s/ExampleSite/offer?a=1#top'})
    expect(await resolve('http://partner.example/offer', null)).toMatchObject({kind: 'fallback'})
})

test.each([
    {},
    null,
    {resourceType: 'CONTENT_ASSET', resourceId: 'content'},
    {resourceType: 'product'},
    {resourceType: 'product', resourceId: ''}
])('retains search for missing or unsupported mappings', async (mapping) => {
    expect(await resolve('/unknown', mapping)).toMatchObject({kind: 'fallback'})
})

test('bounds mapping failures and exposes only a safe status', async () => {
    const result = await resolve('/unknown', null, {
        getUrlMapping: async () => {
            throw {response: {status: 403}, message: 'private URL and query'}
        }
    })
    expect(result).toEqual({kind: 'fallback', reason: 'mapping-error', status: 403})
})

test('follows URI redirects without resource IDs and merges destination params once', async () => {
    const results = [
        {
            statusCode: '302',
            destinationUrl: '/s/ExampleSite/next?own=2&campaign=one',
            copySourceParams: true,
            additionalUrlParams: 'campaign=one'
        },
        {resourceType: 'product', resourceId: 'target'}
    ]
    expect(
        await resolve('/s/ExampleSite/start?source=1#details', null, {
            getUrlMapping: async () => results.shift()
        })
    ).toMatchObject({
        kind: 'internal',
        url: '/shop/ExampleSite/en-US/product/target?own=2&campaign=one&source=1#details'
    })
})

test('honors a resource redirect and does not perform another resource lookup', async () => {
    expect(
        await resolve('/old?drop=1#old', {
            resourceType: 'category',
            resourceId: 'sale',
            statusCode: 301,
            destinationUrl: '/sale?own=2#new',
            copySourceParams: false,
            additionalUrlParams: 'campaign=sale'
        })
    ).toMatchObject({
        kind: 'internal',
        url: '/shop/ExampleSite/en-US/category/sale?own=2&campaign=sale#new'
    })
})

test('preserves duplicate query values while avoiding already-applied redirect additions', async () => {
    expect(
        await resolve('/old?tag=a&tag=b', {
            resourceType: 'product',
            resourceId: 'target',
            statusCode: 307,
            destinationUrl: '/new?tag=a',
            copySourceParams: true,
            additionalUrlParams: 'tag=b&tag=c'
        })
    ).toMatchObject({url: '/shop/ExampleSite/en-US/product/target?tag=a&tag=b&tag=c'})
})

test.each([200, 308, 'bad'])(
    'retains search for unsupported redirect status %s',
    async (statusCode) => {
        expect(
            await resolve('/old', {
                resourceType: 'product',
                resourceId: 'target',
                destinationUrl: '/new',
                statusCode
            })
        ).toMatchObject({kind: 'fallback', reason: 'unsupported-status'})
    }
)

test('detects repeated paths and bounds chains that keep changing', async () => {
    expect(await resolve('/loop', {statusCode: 302, destinationUrl: '/loop'})).toMatchObject({
        kind: 'fallback',
        reason: 'redirect-loop'
    })
    let hops = 0
    expect(
        await resolve('/start', null, {
            getUrlMapping: async () => ({statusCode: 302, destinationUrl: `/hop-${++hops}`})
        })
    ).toMatchObject({kind: 'fallback', reason: 'redirect-limit'})
    expect(hops).toBe(5)
})

test('validates every URI redirect hop and rejects search routes', async () => {
    expect(
        await resolve('/old', {
            statusCode: 302,
            destinationUrl: 'https://unknown.example/product/target'
        })
    ).toMatchObject({kind: 'fallback'})
    expect(
        await resolve('/old', {statusCode: 302, destinationUrl: '/search?q=again'})
    ).toMatchObject({kind: 'fallback', reason: 'search-loop'})
})

test.each([
    {resourceType: 7, resourceId: 'target'},
    {resourceType: {}, resourceId: 'target'},
    {resourceType: 'category', resourceId: 'target', refinements: 'malformed'},
    {resourceType: 'product', resourceId: '\ud800'}
])('retains search for malformed mapping fields', async (mapping) => {
    expect(await resolve('/item', mapping)).toMatchObject({kind: 'fallback'})
})

test('preserves raw query encoding and repeated identical copied parameter pairs', async () => {
    expect(
        await resolve('/old?tag=a&tag=a&x=%2f%20', {
            resourceType: 'product',
            resourceId: 'target',
            statusCode: 302,
            destinationUrl: '/new?keep=%20~&tag=a',
            copySourceParams: true,
            additionalUrlParams: 'campaign=%2f%20'
        })
    ).toMatchObject({
        url: '/shop/ExampleSite/en-US/product/target?keep=%20~&tag=a&tag=a&x=%2f%20&campaign=%2f%20'
    })
})

test('adds category refinements without rewriting existing raw query pairs', async () => {
    expect(
        await resolve('/category?x=%2f%20&tag=a&tag=a', {
            resourceType: 'category',
            resourceId: 'target',
            refinements: {color: 'Blue & Red'}
        })
    ).toMatchObject({
        url: '/shop/ExampleSite/en-US/category/target?x=%2f%20&tag=a&tag=a&refine=color%3DBlue+%26+Red'
    })
})
