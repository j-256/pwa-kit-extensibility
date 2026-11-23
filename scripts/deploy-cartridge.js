/*
 * SPDX-License-Identifier: BSD-3-Clause
 * For full license text, see the LICENSE file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */
/* eslint-disable @typescript-eslint/no-var-requires */

const fs = require('fs')
const path = require('path')
const {spawnSync} = require('child_process')
const {parseArgs} = require('util')

const ROOT = path.resolve(__dirname, '..')
const DEFAULT_CARTRIDGE = 'app_pwakit_base'
const LOCAL_HOOKS_CARTRIDGE = 'int_pwakit_hooks'
const CARTRIDGES = [DEFAULT_CARTRIDGE, LOCAL_HOOKS_CARTRIDGE]
const EXIT = Object.freeze({RUNTIME: 1, USAGE: 2, DEPENDENCY: 3})
const CONNECTION_OPTIONS = ['instance', 'config', 'server', 'webdav-server', 'certificate']
const USAGE = `Usage: npm run deploy:cartridge -- [options]

Upload a selected cartridge from this project or its installed extensibility template.
Requires the b2c CLI (npm install --global @salesforce/b2c-cli) for upload.

Options:
  -c, --cartridge <name>     ${CARTRIDGES.join(' or ')} (default: ${DEFAULT_CARTRIDGE})
  -v, --code-version <name>  code version to upload to (or exported SFCC_CODE_VERSION)
  -i, --instance <name>      named B2C CLI connection, e.g. sandbox or staging
  -C, --config <path>        B2C CLI connection file, in dw.json format
  -s, --server <hostname>    override the configured instance hostname
      --webdav-server <host> separate WebDAV hostname for certificate endpoints
      --certificate <path>  PKCS12 (.p12/.pfx) client certificate
  -a, --activate             activate the target version after uploading
  -r, --reload               reload the target version (requires another version)
  -n, --dry-run              print the source and command without running b2c
  -h, --help                 show this help

Authentication:
  A selected --instance (or exported SFCC_INSTANCE) maps a complete
  WEBDAV_USER_<instance> / WEBDAV_PASS_<instance> pair to SFCC_USERNAME /
  SFCC_PASSWORD, overriding generic credentials. Partial pairs are rejected.
  Without that pair, b2c reads its normal project/shared dw.json, project .env, and SFCC_* environment.
  Use SFCC_USERNAME and SFCC_PASSWORD for a BM username and WebDAV access key.
  For MFA, set SFCC_CERTIFICATE and SFCC_CERTIFICATE_PASSPHRASE, or the dw.json
  certificate and certificate-passphrase fields. Prefer absolute certificate paths.
  Certificate use is optional; server certificate verification stays enabled.
  Inspect the selected connection with b2c setup inspect before uploading.

Upload alone does not import metadata, change site cartridge paths, or enable mail.
Activation/reload requires the API credentials and permissions documented by b2c.

Exit status:
  0  success or dry run
  1  runtime failure or terminated CLI
  2  usage error or unsupported/missing cartridge/code version
  3  b2c executable missing
  Other b2c exit statuses are preserved.
`

function fail(code, message) {
    throw Object.assign(new Error(message), {exitCode: code})
}

function resolveSource(cartridge) {
    let source = path.join(ROOT, 'cartridges', cartridge)
    if (!fs.existsSync(source)) {
        if (cartridge === LOCAL_HOOKS_CARTRIDGE) {
            fail(EXIT.USAGE, `missing local ${cartridge} cartridge`)
        }
        const template = require(path.join(ROOT, 'package.json')).ccExtensibility?.extends
        if (!template)
            fail(EXIT.USAGE, `no local ${cartridge} or extensibility template configured`)
        let templatePackage
        try {
            templatePackage = require.resolve(`${template}/package.json`, {paths: [ROOT]})
        } catch {
            fail(EXIT.USAGE, `template ${template} is not installed; run npm ci`)
        }
        source = path.join(path.dirname(templatePackage), 'cartridges', cartridge)
    }
    if (!fs.existsSync(path.join(source, '.project'))) {
        fail(
            EXIT.USAGE,
            `missing cartridge marker at ${source}; check the template version or source`
        )
    }
    return source
}

function authentication(instance) {
    const env = {...process.env}
    if (instance) {
        const usernameVariable = `WEBDAV_USER_${instance}`
        const passwordVariable = `WEBDAV_PASS_${instance}`
        const username = env[usernameVariable]
        const password = env[passwordVariable]
        if (username !== undefined || password !== undefined) {
            if (!username || !password) {
                fail(
                    EXIT.USAGE,
                    `set both ${usernameVariable} and ${passwordVariable} to nonempty values`
                )
            }
            env.SFCC_USERNAME = username
            env.SFCC_PASSWORD = password
            return {env, source: `${usernameVariable} + ${passwordVariable}`}
        }
    }
    return {env, source: 'b2c configuration'}
}

function main() {
    let values
    try {
        const parsed = parseArgs({
            options: {
                cartridge: {type: 'string', short: 'c'},
                'code-version': {type: 'string', short: 'v'},
                instance: {type: 'string', short: 'i'},
                config: {type: 'string', short: 'C'},
                server: {type: 'string', short: 's'},
                'webdav-server': {type: 'string'},
                certificate: {type: 'string'},
                activate: {type: 'boolean', short: 'a'},
                reload: {type: 'boolean', short: 'r'},
                'dry-run': {type: 'boolean', short: 'n'},
                help: {type: 'boolean', short: 'h'}
            }
        })
        values = parsed.values
    } catch (error) {
        fail(EXIT.USAGE, `${error.message}; use --help for usage`)
    }
    if (values.help) {
        process.stdout.write(USAGE)
        return 0
    }
    for (const [name, value] of Object.entries(values)) {
        if (typeof value === 'string' && !value.trim())
            fail(EXIT.USAGE, `--${name} cannot be empty`)
    }
    const version = values['code-version'] || process.env.SFCC_CODE_VERSION
    if (!version?.trim()) fail(EXIT.USAGE, 'provide --code-version or SFCC_CODE_VERSION')
    if (values.activate && values.reload) fail(EXIT.USAGE, 'choose either --activate or --reload')

    const cartridge = values.cartridge || DEFAULT_CARTRIDGE
    if (!CARTRIDGES.includes(cartridge)) {
        fail(EXIT.USAGE, `--cartridge must be ${CARTRIDGES.join(' or ')}`)
    }

    const auth = authentication(values.instance || process.env.SFCC_INSTANCE)
    const source = resolveSource(cartridge)
    const args = ['code', 'deploy', source, '--cartridge', cartridge, '--code-version', version]
    for (const name of CONNECTION_OPTIONS) {
        if (values[name]) args.push(`--${name}`, values[name])
    }
    if (values.activate) args.push('--activate')
    if (values.reload) args.push('--reload')
    if (values['dry-run']) {
        process.stdout.write(
            `${JSON.stringify(
                {source, authentication: auth.source, command: ['b2c', ...args], cwd: ROOT},
                null,
                2
            )}\n`
        )
        return 0
    }

    process.stderr.write(`deploy-cartridge: uploading ${cartridge} from ${source}\n`)
    const result = spawnSync('b2c', args, {cwd: ROOT, env: auth.env, stdio: 'inherit'})
    if (result.error?.code === 'ENOENT') {
        fail(
            EXIT.DEPENDENCY,
            'b2c is missing; install it with npm install --global @salesforce/b2c-cli'
        )
    }
    if (result.error) fail(EXIT.RUNTIME, result.error.message)
    if (result.signal)
        fail(EXIT.RUNTIME, `b2c terminated by ${result.signal}; check upload state before retrying`)
    return result.status
}

try {
    process.exitCode = main()
} catch (error) {
    process.stderr.write(`deploy-cartridge: ${error.message}\n`)
    process.exitCode = error.exitCode || EXIT.RUNTIME
}
