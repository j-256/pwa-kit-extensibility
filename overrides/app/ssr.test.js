/* eslint-disable @typescript-eslint/no-var-requires */

const mockRoutes = {}
const mockOptions = {}
jest.mock('@salesforce/pwa-kit-runtime/ssr/server/express', () => ({
    getRuntime: () => ({
        createHandler: (options, configure) => {
            Object.assign(mockOptions, options)
            const app = require('express')()
            const get = app.get.bind(app)
            const post = app.post.bind(app)
            app.get = (path, ...handlers) => {
                if (handlers.length) mockRoutes[`GET ${path}`] = handlers.at(-1)
                return get(path, ...handlers)
            }
            app.post = (path, ...handlers) => {
                mockRoutes[`POST ${path}`] = handlers.at(-1)
                return post(path, ...handlers)
            }
            configure(app)
            return {handler: app}
        },
        serveStaticFile: () => (_req, res) => res.end(),
        serveServiceWorker: (_req, res) => res.end(),
        render: (_req, res) => res.end()
    })
}))
jest.mock('@salesforce/pwa-kit-runtime/utils/ssr-config', () => ({
    getConfig: () => require('../../config/default')
}))
jest.mock('@salesforce/pwa-kit-runtime/utils/middleware', () => ({
    defaultPwaKitSecurityHeaders: (_req, _res, next) => next()
}))
jest.mock('@salesforce/pwa-kit-react-sdk/utils/url', () => ({
    getAppOrigin: () => 'https://fallback.example'
}))
jest.mock('@salesforce/pwa-kit-runtime/utils/logger-instance', () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
}))
jest.mock('@salesforce/retail-react-app/app/components/shopper-agent/token-bridge', () => ({
    registerTokenBridgeRoute: () => {}
}))
jest.mock('@salesforce/retail-react-app/app/utils/commerce-client-overrides', () => ({
    getCommerceClientOverridesCspSources: () => []
}))
require('./ssr')

const response = () => {
    const res = {locals: {}, headers: {}}
    res.status = (status) => {
        res.statusCode = status
        return res
    }
    res.set = (name, value) => {
        res.headers[name] = value
        return res
    }
    res.type = () => res
    res.json = res.send = (body) => {
        res.body = body
        return res
    }
    return res
}

test.each(['/passwordless-login-callback', '/reset-password-callback'])(
    'rejects %s before attempting notification when callback mode is off',
    async (path) => {
        const res = response()
        await mockRoutes[`POST ${path}`](
            {headers: {}, body: {}, query: {}, protocol: 'https', get: () => 'storefront.example'},
            res
        )
        expect(res.statusCode).toBe(400)
        expect(res.body.error).toMatch(/callback mode not enabled/i)
    }
)

test('retains config-driven private-client support', () => {
    expect(mockOptions.useSLASPrivateClient).toBe(true)
})

test('rejects unconfigured registration verification', async () => {
    const res = response()
    await mockRoutes['POST /registration-verification-callback']({headers: {}, body: {}}, res)
    expect(res.statusCode).toBe(400)
    expect(res.body.error).toBe('Registration verification callback not configured')
})

test.each([
    'POST /api/order-lookup/verify',
    'GET /api/order-lookup/order/:orderNo',
    'GET /api/order-lookup/oms-meta',
    'POST /api/order-lookup/cancel',
    'POST /api/order-lookup/return'
])('rejects disabled guest-order endpoint %s', async (route) => {
    const res = response()
    await mockRoutes[route]({headers: {}, body: {}, params: {}}, res)
    expect(res.statusCode).toBe(503)
    expect(res.body.error).toBe('Feature not enabled')
})

test('renders trusted-agent callbacks without caching OAuth material', () => {
    const res = response()
    let rendered = false
    mockRoutes['GET /callback']({query: {code: 'code', state: 'state'}}, res, () => {
        rendered = true
    })
    expect(res.headers['Cache-Control']).toBe('no-store')
    expect(rendered).toBe(true)
})

test.each([
    [{xForwardedOrigin: 'https://storefront.example'}, 'https://storefront.example'],
    [{}, 'https://fallback.example']
])('uses the resolved request origin for the sitemap', (locals, origin) => {
    const res = response()
    res.locals = locals
    mockRoutes['GET /robots.txt']({}, res)
    expect(res.body).toBe(`User-agent: *\nDisallow:\n\nSitemap: ${origin}/sitemap_index.xml\n`)
})
