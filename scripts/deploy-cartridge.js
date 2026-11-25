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
const ALL_CARTRIDGES = 'all'
const CARTRIDGE_SELECTIONS = [...CARTRIDGES, ALL_CARTRIDGES]
const EXIT = Object.freeze({RUNTIME: 1, USAGE: 2, DEPENDENCY: 3})
const CONNECTION_OPTIONS = ['instance', 'config', 'server', 'webdav-server', 'certificate']
const USAGE = `Usage: npm run deploy:cartridge -- [options]

Upload a selected cartridge, or both with --cartridge all, from this project
or its installed extensibility template.
Requires the b2c CLI (npm install --global @salesforce/b2c-cli) for upload.

Options:
  -c, --cartridge <name>     ${CARTRIDGE_SELECTIONS.join(', ')} (default: ${DEFAULT_CARTRIDGE})
  -v, --code-version <name>  code version to upload to (or exported SFCC_CODE_VERSION)
  -i, --instance <name>      named B2C CLI connection, e.g. sandbox or staging
  -C, --config <path>        B2C CLI connection file, in dw.json format
  -s, --server <hostname>    override the configured instance hostname
      --webdav-server <host> separate WebDAV hostname for certificate endpoints
      --certificate <path>   PKCS12 (.p12/.pfx) client certificate
  -a, --activate             activate the target version after uploading
  -r, --reload               reload the target version (requires another version)
  -n, --dry-run              print the source and command without running b2c
  -h, --help                 show this help

Preflight:
  PWA_KIT_CARTRIDGE_PREFLIGHT optionally names an absolute executable path.
  Before dry runs and uploads it receives --project-root <path>, --cartridge
  <name>, and --source <path>, with this project as its working directory.
  Its stdout/stderr go to stderr so dry-run JSON stays valid. Nonzero statuses
  block upload and are preserved; signals return 1; unavailable checkers return 3.
  Stderr reports preflight start, success, or skipped when the variable is unset.
  Help never invokes the preflight.

Authentication:
  A selected --instance (or exported SFCC_INSTANCE) maps a complete
  WEBDAV_USER_<instance> / WEBDAV_PASS_<instance> pair to SFCC_USERNAME /
  SFCC_PASSWORD, overriding generic credentials. Partial pairs are rejected.
  Without that pair, b2c reads its normal project/shared dw.json, project .env, and SFCC_* environment.
  Use SFCC_USERNAME and SFCC_PASSWORD for a BM username and WebDAV access key.
  For MFA, set SFCC_CERTIFICATE and SFCC_CERTIFICATE_PASSPHRASE, or the dw.json
  certificate and certificate-passphrase fields. Prefer absolute certificate paths.
  Certificate use is optional; server certificate verification stays enabled.
  b2c setup inspect reports native CLI settings, not this wrapper's alias mapping.
  --instance selects a declared connection; it does not supply a hostname.
  Supply connection settings through --config, native SFCC_* variables, or flags.
  For matching native inspection, use the same config/instance and map the
  selected WebDAV aliases to SFCC_USERNAME/SFCC_PASSWORD explicitly.
  Ignored local connection and env files are not copied into Git worktrees.

Batch uploads:
  --cartridge all resolves both sources and completes both configured preflights
  before either upload. Uploads run sequentially; failure stops the remaining work.
  --activate/--reload applies only to the final upload, after earlier success.
  Uploads are not atomic: completed uploads remain if a later step fails.
  Single-cartridge dry-run JSON uses source/command; all uses cartridges/sources
  and commands in upload order, with finalization on the last command only.

Upload alone does not import metadata, change site cartridge paths, or enable mail.
Activation/reload requires the API credentials and permissions documented by b2c.

Exit status:
  0  success or dry run
  1  runtime failure or terminated CLI
  2  usage error or unsupported/missing cartridge/code version
  3  b2c executable missing
  Other preflight and b2c exit statuses are preserved.
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

function runPreflight(cartridge, source) {
    const executable = process.env.PWA_KIT_CARTRIDGE_PREFLIGHT
    if (executable === undefined) {
        process.stderr.write(
            `deploy-cartridge: preflight skipped for ${cartridge} (PWA_KIT_CARTRIDGE_PREFLIGHT is unset)\n`
        )
        return
    }
    if (!executable.trim() || !path.isAbsolute(executable)) {
        fail(EXIT.USAGE, 'cartridge preflight must be a nonempty absolute executable path')
    }
    try {
        fs.accessSync(executable, fs.constants.X_OK)
    } catch {
        fail(EXIT.DEPENDENCY, 'configured cartridge preflight is unavailable or not executable')
    }
    process.stderr.write(`deploy-cartridge: running preflight for ${cartridge}\n`)
    const result = spawnSync(
        executable,
        ['--project-root', ROOT, '--cartridge', cartridge, '--source', source],
        {cwd: ROOT, env: process.env, stdio: ['ignore', 2, 2]}
    )
    if (result.error) {
        const missing = ['ENOENT', 'EACCES'].includes(result.error.code)
        fail(missing ? EXIT.DEPENDENCY : EXIT.RUNTIME, 'cartridge preflight could not run')
    }
    if (result.signal) fail(EXIT.RUNTIME, `cartridge preflight terminated by ${result.signal}`)
    if (result.status !== 0)
        fail(result.status || EXIT.RUNTIME, 'cartridge preflight failed; upload blocked')
    process.stderr.write(`deploy-cartridge: preflight passed for ${cartridge}\n`)
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

    const selection = values.cartridge || DEFAULT_CARTRIDGE
    if (!CARTRIDGE_SELECTIONS.includes(selection)) {
        fail(EXIT.USAGE, `--cartridge must be ${CARTRIDGE_SELECTIONS.join(' or ')}`)
    }

    const auth = authentication(values.instance || process.env.SFCC_INSTANCE)
    const cartridges = selection === ALL_CARTRIDGES ? CARTRIDGES : [selection]
    const sources = cartridges.map(resolveSource)
    sources.forEach((source, index) => runPreflight(cartridges[index], source))
    const commands = cartridges.map((cartridge, index) => {
        const args = [
            'code',
            'deploy',
            sources[index],
            '--cartridge',
            cartridge,
            '--code-version',
            version
        ]
        for (const name of CONNECTION_OPTIONS) {
            if (values[name]) args.push(`--${name}`, values[name])
        }
        if (index === cartridges.length - 1) {
            if (values.activate) args.push('--activate')
            if (values.reload) args.push('--reload')
        }
        return args
    })
    if (values['dry-run']) {
        const plan =
            selection === ALL_CARTRIDGES
                ? {
                      cartridges,
                      sources,
                      authentication: auth.source,
                      commands: commands.map((args) => ['b2c', ...args]),
                      cwd: ROOT
                  }
                : {
                      source: sources[0],
                      authentication: auth.source,
                      command: ['b2c', ...commands[0]],
                      cwd: ROOT
                  }
        process.stdout.write(`${JSON.stringify(plan, null, 2)}\n`)
        return 0
    }

    for (let index = 0; index < cartridges.length; index++) {
        const cartridge = cartridges[index]
        const previous = index > 0 ? 'Earlier uploads completed; ' : ''
        const failureContext =
            cartridges.length > 1
                ? `${previous}deployment stopped at ${cartridge}; remaining uploads skipped; check remote state before retrying. `
                : ''
        process.stderr.write(`deploy-cartridge: uploading ${cartridge} from ${sources[index]}\n`)
        const result = spawnSync('b2c', commands[index], {
            cwd: ROOT,
            env: auth.env,
            stdio: 'inherit'
        })
        if (result.error?.code === 'ENOENT') {
            fail(
                EXIT.DEPENDENCY,
                failureContext +
                    'b2c is missing; install it with npm install --global @salesforce/b2c-cli'
            )
        }
        if (result.error) fail(EXIT.RUNTIME, failureContext + result.error.message)
        if (result.signal) {
            fail(
                EXIT.RUNTIME,
                failureContext +
                    `b2c terminated by ${result.signal}; check upload state before retrying`
            )
        }
        if (result.status !== 0) {
            if (failureContext) process.stderr.write(`deploy-cartridge: ${failureContext}\n`)
            return result.status ?? EXIT.RUNTIME
        }
    }
    return 0
}

try {
    process.exitCode = main()
} catch (error) {
    process.stderr.write(`deploy-cartridge: ${error.message}\n`)
    process.exitCode = error.exitCode || EXIT.RUNTIME
}
