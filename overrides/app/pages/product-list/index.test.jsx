// Run the template's PLP behavior checks against this override
jest.mock('@salesforce/retail-react-app/app/pages/product-list', () =>
    jest.requireActual('./index')
)
// The optional Page Designer runtime is outside these PLP interactions
jest.mock('@salesforce/commerce-sdk-react/page-designer', () => ({
    PageContext: jest.requireActual('react').createContext({}),
    Region: () => null,
    Page: () => null,
    registry: {getComponent: () => undefined, registerComponent: () => {}}
}))
jest.mock('@salesforce/pwa-kit-react-sdk/ssr/universal/hooks', () => ({
    ...jest.requireActual('@salesforce/pwa-kit-react-sdk/ssr/universal/hooks'),
    useCorrelationId: () => ({correlationId: 'plp-test'})
}))
import '@salesforce/retail-react-app/jest-setup'
import '@salesforce/retail-react-app/app/pages/product-list/index.test'

import {rest} from 'msw'
import {productsResponse} from '@salesforce/retail-react-app/app/mocks/mock-data'

beforeEach(() => {
    global.server.use(rest.get('*/products', (req, res, ctx) => res(ctx.json(productsResponse))))
})
