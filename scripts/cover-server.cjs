// Keep private development overlays out of the public catalog capture
require('../config/load-env').loadEnv = () => {}
const openPath = require.resolve('open')
require(openPath)
require.cache[openPath].exports = async () => {}
require('../dev-server')
