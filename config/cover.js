/* eslint-disable @typescript-eslint/no-var-requires */
const project = require('./default')
const reference = require('@salesforce/retail-react-app/config/default')
const referenceSites = require('@salesforce/retail-react-app/config/sites')

// Use the upstream public demo catalog so CI needs no private SLAS client
const siteId = 'RefArch'
const apiHost = reference.ssrParameters.proxyConfigs.find((proxy) => proxy.path === 'api').host
const parameters = {
    ...reference.app.commerceAPI.parameters,
    shortCode: apiHost.split('.')[0],
    siteId
}
const imageHost = 'zzrf-001.dx.commercecloud.salesforce.com'

module.exports = {
    ...project,
    app: {
        ...project.app,
        useSLASPrivateClient: false,
        defaultSite: siteId,
        sites: referenceSites.filter((site) => site.id === siteId),
        commerceAPI: {...project.app.commerceAPI, parameters},
        storeLocatorEnabled: false
    },
    ssrParameters: {
        ...project.ssrParameters,
        proxyConfigs: [
            {host: `${parameters.shortCode}.api.commercecloud.salesforce.com`, path: 'api'},
            {host: imageHost, path: 'ocapi'}
        ]
    },
    custom: {...project.custom, imageHost}
}
