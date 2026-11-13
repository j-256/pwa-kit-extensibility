/* eslint-disable @typescript-eslint/no-var-requires */
import routes from './routes'
import {getConfig} from '@salesforce/pwa-kit-runtime/utils/ssr-config'

jest.mock('@salesforce/pwa-kit-runtime/utils/ssr-config', () => ({getConfig: jest.fn()}))

const config = require('../../config/default')

beforeEach(() => getConfig.mockReturnValue(config))

test('keeps custom routes ahead of the template and the catch-all last', () => {
    const allRoutes = routes()
    expect(allRoutes.slice(0, 2).map(({path}) => path)).toEqual(['/test', '/product-search'])
    expect(allRoutes.at(-1).path).toBe('*')
    expect(allRoutes.some(({path}) => path === '/reset-password-landing')).toBe(true)
    expect(allRoutes.some(({path}) => path === '/social-callback')).toBe(true)
})

test('keeps email-dependent routes unavailable with the project configuration', () => {
    const paths = routes().map(({path}) => path)
    expect(paths).not.toContain('/passwordless-login-landing')
    expect(paths).not.toContain('/order-lookup')
})

test('includes upstream guest order routes when their feature is enabled', () => {
    getConfig.mockReturnValue({
        ...config,
        app: {...config.app, guestOrderLookup: {enabled: true}}
    })
    expect(routes().map(({path}) => path)).toEqual(
        expect.arrayContaining([
            '/order-lookup',
            '/order-lookup/verify/:orderNo',
            '/order-lookup/order/:orderNo',
            '/order-lookup/results/:orderNo'
        ])
    )
})

test('includes case-sensitive express-payment routes when the agent is enabled', () => {
    getConfig.mockReturnValue({
        ...config,
        app: {...config.app, commerceAgent: {...config.app.commerceAgent, enabled: 'true'}}
    })
    expect(routes()).toEqual(
        expect.arrayContaining([
            expect.objectContaining({path: '/Payments-Express', exact: true, sensitive: true}),
            expect.objectContaining({
                path: '/Payments-ExpressProduct',
                exact: true,
                sensitive: true
            })
        ])
    )
})
