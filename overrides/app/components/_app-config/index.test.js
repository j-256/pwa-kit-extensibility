/* eslint-disable @typescript-eslint/no-var-requires */
import AppConfig from './index'
import {getConfig} from '@salesforce/pwa-kit-runtime/utils/ssr-config'

jest.mock('@salesforce/pwa-kit-runtime/utils/ssr-config', () => ({getConfig: jest.fn()}))
jest.mock('@salesforce/pwa-kit-react-sdk/ssr/universal/components/with-react-query', () => ({
    withReactQuery: (component) => component
}))
jest.mock('@salesforce/pwa-kit-react-sdk/ssr/universal/hooks', () => ({
    useCorrelationId: () => ({correlationId: 'correlation'}),
    useOrigin: () => 'https://storefront.example'
}))

const config = require('../../../../config/default')
const locals = {
    appConfig: config.app,
    site: config.app.sites[0],
    locale: config.app.sites[0].l10n.supportedLocales[0],
    traceparent: '00-12345678901234567890123456789012-1234567890123456-01'
}

beforeEach(() => getConfig.mockReturnValue(config))

test('forwards request site and trace context to the API provider', () => {
    const {props} = AppConfig({locals})
    expect(props.headers).toEqual(
        expect.objectContaining({
            'correlation-id': 'correlation',
            'x-site-id': 'RefArchJ',
            traceparent: locals.traceparent
        })
    )
})

test.each([true, false])('uses configured private-client mode %s', (useSLASPrivateClient) => {
    getConfig.mockReturnValue({...config, app: {...config.app, useSLASPrivateClient}})
    const {props} = AppConfig({locals})
    expect(props.enablePWAKitPrivateClient).toBe(useSLASPrivateClient)
    expect(props.privateClientProxyEndpoint).toMatch(/^https:\/\/storefront\.example\//)
    expect(props.publicClientProxyEndpoint).toMatch(/^https:\/\/storefront\.example\//)
})

test('honors the runtime HTTP-only cookie opt-in', () => {
    window.__MRT_ENABLE_HTTPONLY_SESSION_COOKIES__ = 'true'
    try {
        expect(AppConfig({locals}).props.enableHttpOnlySessionCookies).toBe(true)
    } finally {
        delete window.__MRT_ENABLE_HTTPONLY_SESSION_COOKIES__
    }
})
