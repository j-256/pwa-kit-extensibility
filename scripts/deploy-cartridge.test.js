/*
 * SPDX-License-Identifier: BSD-3-Clause
 * For full license text, see the LICENSE file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */
/* eslint-disable @typescript-eslint/no-var-requires */

const fs = require('fs')
const os = require('os')
const path = require('path')
const {spawnSync} = require('child_process')

let root
let environment
const SCRIPT = path.join(__dirname, 'deploy-cartridge.js')
const CERTIFICATE_PASSPHRASE = 'fixture-certificate-secret'

function cartridge(directory) {
    fs.mkdirSync(directory, {recursive: true})
    fs.writeFileSync(path.join(directory, '.project'), '<projectDescription/>')
    return directory
}

function run(args, overrides = {}) {
    return spawnSync(process.execPath, [path.join(root, 'scripts/deploy-cartridge.js'), ...args], {
        cwd: os.tmpdir(),
        env: {...environment, ...overrides},
        encoding: 'utf8'
    })
}

function calls() {
    return fs.existsSync(environment.CALLS_PATH)
        ? JSON.parse(fs.readFileSync(environment.CALLS_PATH))
        : []
}

function captured() {
    return JSON.parse(fs.readFileSync(environment.CAPTURE_PATH, 'utf8'))
}

beforeEach(() => {
    root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'pwakit-cartridge-')))
    fs.mkdirSync(path.join(root, 'scripts'))
    fs.mkdirSync(path.join(root, 'bin'))
    fs.writeFileSync(path.join(root, 'package.json'), '{}')
    if (fs.existsSync(SCRIPT)) {
        fs.copyFileSync(SCRIPT, path.join(root, 'scripts/deploy-cartridge.js'))
    }
    environment = {...process.env}
    for (const key of Object.keys(environment)) {
        if (key.startsWith('SFCC_') || key.startsWith('WEBDAV_')) delete environment[key]
    }
    delete environment.PWA_KIT_CARTRIDGE_PREFLIGHT
    environment.PATH = path.join(root, 'bin')
    environment.CAPTURE_PATH = path.join(root, 'capture.json')
    environment.CALLS_PATH = path.join(root, 'calls.json')
    fs.writeFileSync(
        path.join(root, 'bin/b2c'),
        `#!${process.execPath}
const fs = require('fs')
const captured = {
    args: process.argv.slice(2),
    cwd: process.cwd(),
    username: process.env.SFCC_USERNAME,
    password: process.env.SFCC_PASSWORD,
    certificate: process.env.SFCC_CERTIFICATE,
    passphrase: process.env.SFCC_CERTIFICATE_PASSPHRASE
}
fs.writeFileSync(process.env.CAPTURE_PATH, JSON.stringify(captured))
const calls = fs.existsSync(process.env.CALLS_PATH) ? JSON.parse(fs.readFileSync(process.env.CALLS_PATH)) : []
calls.push(captured)
fs.writeFileSync(process.env.CALLS_PATH, JSON.stringify(calls))
const selected = captured.args[captured.args.indexOf('--cartridge') + 1]
if (process.env.B2C_FAIL_CARTRIDGE === selected) process.exit(17)
process.stdout.write('cli-result\\n')
process.stderr.write('cli-progress\\n')
if (process.env.B2C_SIGNAL) process.kill(process.pid, 'SIGTERM')
else process.exit(Number(process.env.B2C_EXIT || 0))
`,
        {mode: 0o755}
    )
})

afterEach(() => fs.rmSync(root, {recursive: true, force: true}))

test.each(['-h', '--help'])('shows help without a cartridge or b2c dependency: %s', (flag) => {
    const result = run([flag], {PATH: ''})
    expect(result.status).toBe(0)
    expect(result.stdout).toContain('Usage:')
    expect(result.stdout).toContain('SFCC_CERTIFICATE_PASSPHRASE')
    expect(result.stderr).toBe('')
})

test('uploads only the local cartridge from the project root, passing native connection options', () => {
    const local = cartridge(path.join(root, 'cartridges/app_pwakit_base'))
    cartridge(path.join(root, 'cartridges/unrelated'))
    const config = path.join(root, 'private dw.json')
    const result = run(
        [
            '-i',
            'sandbox',
            '-v',
            'reviewed',
            '--config',
            config,
            '--server',
            'sandbox.example.com',
            '--webdav-server',
            'cert.sandbox.example.com',
            '--certificate',
            '/private/client certificate.p12',
            '--reload'
        ],
        {
            SFCC_CERTIFICATE: '/private/environment.p12',
            SFCC_CERTIFICATE_PASSPHRASE: CERTIFICATE_PASSPHRASE
        }
    )
    expect(result.status).toBe(0)
    expect(captured()).toEqual({
        args: [
            'code',
            'deploy',
            local,
            '--cartridge',
            'app_pwakit_base',
            '--code-version',
            'reviewed',
            '--instance',
            'sandbox',
            '--config',
            config,
            '--server',
            'sandbox.example.com',
            '--webdav-server',
            'cert.sandbox.example.com',
            '--certificate',
            '/private/client certificate.p12',
            '--reload'
        ],
        cwd: root,
        certificate: '/private/environment.p12',
        passphrase: CERTIFICATE_PASSPHRASE
    })
    expect(result.stdout).toBe('cli-result\n')
    expect(result.stderr).toContain('cli-progress')
    expect(result.stdout + result.stderr).not.toContain(CERTIFICATE_PASSPHRASE)
})

test('uses the installed extensibility template cartridge without copying it into the project', () => {
    fs.writeFileSync(
        path.join(root, 'package.json'),
        JSON.stringify({
            ccExtensibility: {extends: '@salesforce/retail-react-app'}
        })
    )
    const template = path.join(root, 'node_modules/@salesforce/retail-react-app')
    const source = cartridge(path.join(template, 'cartridges/app_pwakit_base'))
    fs.writeFileSync(
        path.join(template, 'package.json'),
        JSON.stringify({name: '@salesforce/retail-react-app'})
    )
    const result = run(['--code-version=reviewed', '--instance=staging', '--activate'])
    expect(result.status).toBe(0)
    expect(captured().args).toEqual([
        'code',
        'deploy',
        source,
        '--cartridge',
        'app_pwakit_base',
        '--code-version',
        'reviewed',
        '--instance',
        'staging',
        '--activate'
    ])
    expect(fs.existsSync(path.join(root, 'cartridges'))).toBe(false)
})

test('prefers the local cartridge when a template is also configured', () => {
    const source = cartridge(path.join(root, 'cartridges/app_pwakit_base'))
    fs.writeFileSync(
        path.join(root, 'package.json'),
        JSON.stringify({
            ccExtensibility: {extends: 'missing-template'}
        })
    )
    expect(run(['-vreviewed']).status).toBe(0)
    expect(captured().args[2]).toBe(source)
})

test.each([
    ['--cartridge', 'int_pwakit_hooks'],
    ['--cartridge=int_pwakit_hooks'],
    ['-cint_pwakit_hooks']
])('uploads the selected local hooks cartridge: %j', (...selection) => {
    cartridge(path.join(root, 'cartridges/app_pwakit_base'))
    const source = cartridge(path.join(root, 'cartridges/int_pwakit_hooks'))
    const result = run([...selection, '-v', 'reviewed', '-i', 'sandbox'], {
        WEBDAV_USER_sandbox: 'fixture-target-user',
        WEBDAV_PASS_sandbox: 'fixture-target-key'
    })
    expect(result.status).toBe(0)
    expect(captured()).toMatchObject({
        args: [
            'code',
            'deploy',
            source,
            '--cartridge',
            'int_pwakit_hooks',
            '--code-version',
            'reviewed',
            '--instance',
            'sandbox'
        ],
        username: 'fixture-target-user',
        password: 'fixture-target-key'
    })
})

test.each(['../outside', '/tmp/other', 'unrelated', ''])(
    'rejects unsupported cartridge %j',
    (name) => {
        cartridge(path.join(root, 'cartridges/app_pwakit_base'))
        const result = run(['--cartridge', name, '-v', 'reviewed'])
        expect(result.status).toBe(2)
        expect(fs.existsSync(environment.CAPTURE_PATH)).toBe(false)
    }
)

test('requires the project-owned cartridge locally rather than falling back to a template', () => {
    const template = path.join(root, 'node_modules/fixture-template')
    cartridge(path.join(template, 'cartridges/int_pwakit_hooks'))
    fs.writeFileSync(path.join(template, 'package.json'), '{"name":"fixture-template"}')
    fs.writeFileSync(
        path.join(root, 'package.json'),
        '{"ccExtensibility":{"extends":"fixture-template"}}'
    )
    const result = run(['-c', 'int_pwakit_hooks', '-v', 'reviewed'])
    expect(result.status).toBe(2)
    expect(result.stderr).toContain('local int_pwakit_hooks')
    expect(fs.existsSync(environment.CAPTURE_PATH)).toBe(false)
})

test.each([
    ['-nvreviewed'],
    ['--dry-run', '--code-version=reviewed', '--'],
    ['--code-version', 'reviewed', '-n']
])('dry-run resolves the source without b2c or credential output: %j', (...args) => {
    const source = cartridge(path.join(root, 'cartridges/app_pwakit_base'))
    const result = run(args, {PATH: '', SFCC_CERTIFICATE_PASSPHRASE: CERTIFICATE_PASSPHRASE})
    expect(result.status).toBe(0)
    expect(JSON.parse(result.stdout)).toEqual({
        source,
        authentication: 'b2c configuration',
        command: [
            'b2c',
            'code',
            'deploy',
            source,
            '--cartridge',
            'app_pwakit_base',
            '--code-version',
            'reviewed'
        ],
        cwd: root
    })
    expect(result.stderr).toContain('preflight skipped for app_pwakit_base')
    expect(result.stdout).not.toContain(CERTIFICATE_PASSPHRASE)
    expect(fs.existsSync(environment.CAPTURE_PATH)).toBe(false)
})

test('accepts an explicitly exported code version', () => {
    cartridge(path.join(root, 'cartridges/app_pwakit_base'))
    expect(run([], {SFCC_CODE_VERSION: 'environment-version'}).status).toBe(0)
    expect(captured().args).toContain('environment-version')
})

test.each([
    [],
    ['--code-version'],
    ['--code-version='],
    ['--code-version', ' '],
    ['-v', 'reviewed', '--instance='],
    ['-v', 'reviewed', '--unknown'],
    ['-v', 'reviewed', '--activate', '--reload'],
    ['-v', 'reviewed', '--', 'unexpected'],
    ['-v', 'reviewed', '--password', 'do-not-log-this']
])('rejects invalid arguments before invoking b2c: %j', (...args) => {
    cartridge(path.join(root, 'cartridges/app_pwakit_base'))
    const result = run(args)
    expect(result.status).toBe(2)
    expect(result.stdout).toBe('')
    expect(result.stderr).not.toContain('do-not-log-this')
    expect(fs.existsSync(environment.CAPTURE_PATH)).toBe(false)
})

test('reports a missing cartridge before invoking b2c', () => {
    const result = run(['-v', 'reviewed'])
    expect(result.status).toBe(2)
    expect(result.stderr).toContain('app_pwakit_base')
    expect(fs.existsSync(environment.CAPTURE_PATH)).toBe(false)
})

test('reports a missing CLI distinctly from deployment failure', () => {
    cartridge(path.join(root, 'cartridges/app_pwakit_base'))
    expect(run(['-v', 'reviewed'], {PATH: ''}).status).toBe(3)
})

test('preserves the CLI failure exit status', () => {
    cartridge(path.join(root, 'cartridges/app_pwakit_base'))
    expect(run(['-v', 'reviewed'], {B2C_EXIT: '17'}).status).toBe(17)
})

test('reports a terminated CLI as a runtime failure', () => {
    cartridge(path.join(root, 'cartridges/app_pwakit_base'))
    const result = run(['-v', 'reviewed'], {B2C_SIGNAL: '1'})
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('SIGTERM')
})

test.each(['sandbox', 'staging'])('maps the selected instance credential pair: %s', (instance) => {
    cartridge(path.join(root, 'cartridges/app_pwakit_base'))
    const result = run(['-i', instance, '-v', 'reviewed'], {
        [`WEBDAV_USER_${instance}`]: 'fixture-target-user',
        [`WEBDAV_PASS_${instance}`]: 'fixture-target-key',
        SFCC_USERNAME: 'stale-user',
        SFCC_PASSWORD: 'stale-key'
    })
    expect(result.status).toBe(0)
    expect(captured()).toMatchObject({
        username: 'fixture-target-user',
        password: 'fixture-target-key'
    })
    expect(result.stdout + result.stderr).not.toContain('fixture-target-key')
})

test('maps credentials for an instance selected through SFCC_INSTANCE', () => {
    cartridge(path.join(root, 'cartridges/app_pwakit_base'))
    const result = run(['-v', 'reviewed'], {
        SFCC_INSTANCE: 'sandbox',
        WEBDAV_USER_sandbox: 'fixture-target-user',
        WEBDAV_PASS_sandbox: 'fixture-target-key'
    })
    expect(result.status).toBe(0)
    expect(captured()).toMatchObject({
        username: 'fixture-target-user',
        password: 'fixture-target-key'
    })
})

test.each([
    {WEBDAV_USER_sandbox: 'fixture-target-user'},
    {WEBDAV_PASS_sandbox: 'fixture-target-key'},
    {WEBDAV_USER_sandbox: '', WEBDAV_PASS_sandbox: ''}
])('rejects partial or empty instance credentials without invoking b2c', (aliases) => {
    cartridge(path.join(root, 'cartridges/app_pwakit_base'))
    const result = run(['-i', 'sandbox', '-v', 'reviewed'], aliases)
    expect(result.status).toBe(2)
    expect(result.stderr).toContain('WEBDAV_USER_sandbox')
    expect(result.stderr).toContain('WEBDAV_PASS_sandbox')
    expect(result.stderr).not.toContain('fixture-target-key')
    expect(fs.existsSync(environment.CAPTURE_PATH)).toBe(false)
})

test('dry-run shows the authentication source without exposing credentials', () => {
    cartridge(path.join(root, 'cartridges/app_pwakit_base'))
    const result = run(['-i', 'sandbox', '-v', 'reviewed', '-n'], {
        WEBDAV_USER_sandbox: 'fixture-target-user',
        WEBDAV_PASS_sandbox: 'fixture-target-key'
    })
    expect(result.status).toBe(0)
    expect(JSON.parse(result.stdout).authentication).toBe(
        'WEBDAV_USER_sandbox + WEBDAV_PASS_sandbox'
    )
    expect(result.stdout).not.toContain('fixture-target-user')
    expect(result.stdout).not.toContain('fixture-target-key')
    expect(fs.existsSync(environment.CAPTURE_PATH)).toBe(false)
})

function preflight() {
    const executable = path.join(root, 'bin', 'review preflight')
    fs.writeFileSync(
        executable,
        `#!${process.execPath}
const fs = require('fs')
const captured = {
    args: process.argv.slice(2),
    cwd: process.cwd(),
    uploaded: fs.existsSync(process.env.CAPTURE_PATH)
}
fs.writeFileSync(process.env.PREFLIGHT_CAPTURE, JSON.stringify(captured))
const calls = fs.existsSync(process.env.PREFLIGHT_CALLS) ? JSON.parse(fs.readFileSync(process.env.PREFLIGHT_CALLS)) : []
calls.push(captured)
fs.writeFileSync(process.env.PREFLIGHT_CALLS, JSON.stringify(calls))
if (process.env.PREFLIGHT_FAIL_CARTRIDGE === process.argv[process.argv.indexOf('--cartridge') + 1]) process.exit(4)
process.stderr.write('preflight-diagnostic\\n')
process.stdout.write('preflight-result\\n')
if (process.env.PREFLIGHT_SIGNAL) process.kill(process.pid, 'SIGTERM')
else process.exit(Number(process.env.PREFLIGHT_EXIT || 0))
`,
        {mode: 0o755}
    )
    return {
        PWA_KIT_CARTRIDGE_PREFLIGHT: executable,
        PREFLIGHT_CAPTURE: path.join(root, 'preflight.json'),
        PREFLIGHT_CALLS: path.join(root, 'preflight-calls.json')
    }
}

test.each([[], ['--dry-run']])('runs a configured preflight before deployment: %j', (...mode) => {
    const source = cartridge(path.join(root, 'cartridges/app_pwakit_base'))
    const config = preflight()
    const result = run(['-v', 'reviewed', ...mode], config)
    expect(result.status).toBe(0)
    expect(JSON.parse(fs.readFileSync(config.PREFLIGHT_CAPTURE))).toEqual({
        args: ['--project-root', root, '--cartridge', 'app_pwakit_base', '--source', source],
        cwd: root,
        uploaded: false
    })
    expect(result.stderr).toContain('running preflight for app_pwakit_base')
    expect(result.stderr).toContain('preflight passed for app_pwakit_base')
    expect(result.stderr.indexOf('running preflight')).toBeLessThan(
        result.stderr.indexOf('preflight-diagnostic')
    )
    expect(result.stderr.indexOf('preflight-diagnostic')).toBeLessThan(
        result.stderr.indexOf('preflight passed')
    )
    expect(result.stdout).not.toContain('preflight-diagnostic')
    expect(result.stdout).not.toContain('preflight-result')
    expect(fs.existsSync(environment.CAPTURE_PATH)).toBe(mode.length === 0)
})

test.each([[], ['--dry-run']])('blocks deployment when preflight fails: %j', (...mode) => {
    cartridge(path.join(root, 'cartridges/app_pwakit_base'))
    const result = run(['-v', 'reviewed', ...mode], {...preflight(), PREFLIGHT_EXIT: '4'})
    expect(result.status).toBe(4)
    expect(result.stderr).toContain('running preflight for app_pwakit_base')
    expect(result.stderr).toContain('preflight failed')
    expect(result.stderr).not.toContain('preflight passed')
    expect(fs.existsSync(environment.CAPTURE_PATH)).toBe(false)
})

test.each(['', 'relative-checker', '/missing/checker'])(
    'rejects unavailable configured preflight %j before upload',
    (executable) => {
        cartridge(path.join(root, 'cartridges/app_pwakit_base'))
        const result = run(['-v', 'reviewed'], {PWA_KIT_CARTRIDGE_PREFLIGHT: executable})
        expect(result.status).not.toBe(0)
        expect(result.stderr).toContain('preflight')
        expect(fs.existsSync(environment.CAPTURE_PATH)).toBe(false)
    }
)

test('rejects a configured preflight without execute permission', () => {
    cartridge(path.join(root, 'cartridges/app_pwakit_base'))
    const config = preflight()
    fs.chmodSync(config.PWA_KIT_CARTRIDGE_PREFLIGHT, 0o644)
    const result = run(['-v', 'reviewed'], config)
    expect(result.status).toBe(3)
    expect(fs.existsSync(environment.CAPTURE_PATH)).toBe(false)
})

test('treats a terminated preflight as a runtime failure without uploading', () => {
    cartridge(path.join(root, 'cartridges/app_pwakit_base'))
    const result = run(['-v', 'reviewed'], {...preflight(), PREFLIGHT_SIGNAL: '1'})
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('SIGTERM')
    expect(fs.existsSync(environment.CAPTURE_PATH)).toBe(false)
})

test('keeps help independent of configured preflight availability', () => {
    const result = run(['--help'], {PWA_KIT_CARTRIDGE_PREFLIGHT: '/missing/checker'})
    expect(result.status).toBe(0)
    expect(result.stdout).toContain('PWA_KIT_CARTRIDGE_PREFLIGHT')
    expect(fs.existsSync(environment.CAPTURE_PATH)).toBe(false)
})

test('keeps dry-run stdout valid JSON when the preflight writes output', () => {
    cartridge(path.join(root, 'cartridges/app_pwakit_base'))
    const result = run(['-v', 'reviewed', '--dry-run'], preflight())
    expect(result.status).toBe(0)
    expect(JSON.parse(result.stdout).command[0]).toBe('b2c')
    expect(result.stderr).toContain('preflight-result')
})

test.each([[], ['--dry-run']])('reports an unconfigured preflight distinctly: %j', (...mode) => {
    cartridge(path.join(root, 'cartridges/app_pwakit_base'))
    const result = run(['-v', 'reviewed', ...mode])
    expect(result.status).toBe(0)
    expect(result.stderr).toContain(
        'preflight skipped for app_pwakit_base (PWA_KIT_CARTRIDGE_PREFLIGHT is unset)'
    )
    expect(result.stderr).not.toContain('running preflight')
    expect(result.stderr).not.toContain('preflight passed')
    expect(result.stdout).not.toContain('preflight skipped')
})

const ALL_CARTRIDGES = ['app_pwakit_base', 'int_pwakit_hooks']
const selectedCartridge = (call) => call.args[call.args.indexOf('--cartridge') + 1]
const createBoth = () =>
    ALL_CARTRIDGES.map((name) => cartridge(path.join(root, 'cartridges', name)))

test.each([undefined, '--activate', '--reload'])(
    'uploads both only after both preflights and finalizes once: %j',
    (finalize) => {
        const sources = createBoth()
        const config = preflight()
        const args = ['-c', 'all', '-v', 'reviewed', '-i', 'sandbox', '--server', 'sandbox.example']
        if (finalize) args.push(finalize)
        const result = run(args, {
            ...config,
            WEBDAV_USER_sandbox: 'fixture-user',
            WEBDAV_PASS_sandbox: 'fixture-key'
        })
        expect(result.status).toBe(0)
        const uploads = calls()
        expect(uploads.map(selectedCartridge)).toEqual(ALL_CARTRIDGES)
        expect(uploads.map((call) => call.args[2])).toEqual(sources)
        expect(uploads[0].args).not.toEqual(expect.arrayContaining(['--activate']))
        expect(uploads[0].args).not.toEqual(expect.arrayContaining(['--reload']))
        expect(uploads.map((call) => call.username)).toEqual(['fixture-user', 'fixture-user'])
        expect(uploads.map((call) => call.password)).toEqual(['fixture-key', 'fixture-key'])
        expect(uploads[1].args.includes(finalize)).toBe(Boolean(finalize))
        const checks = JSON.parse(fs.readFileSync(config.PREFLIGHT_CALLS))
        expect(checks.map((call) => call.args[3])).toEqual(ALL_CARTRIDGES)
        expect(checks.map((call) => call.uploaded)).toEqual([false, false])
    }
)

test('blocks every upload when the second cartridge preflight fails', () => {
    createBoth()
    const config = preflight()
    const result = run(['--cartridge=all', '-v', 'reviewed', '--activate'], {
        ...config,
        PREFLIGHT_FAIL_CARTRIDGE: 'int_pwakit_hooks'
    })
    expect(result.status).toBe(4)
    expect(calls()).toEqual([])
    expect(JSON.parse(fs.readFileSync(config.PREFLIGHT_CALLS))).toHaveLength(2)
})

test('resolves all sources before any preflight or upload', () => {
    cartridge(path.join(root, 'cartridges/app_pwakit_base'))
    const config = preflight()
    const result = run(['-call', '-v', 'reviewed'], config)
    expect(result.status).toBe(2)
    expect(calls()).toEqual([])
    expect(fs.existsSync(config.PREFLIGHT_CAPTURE)).toBe(false)
})

test('stops after the first failed upload without scheduling activation or reload', () => {
    createBoth()
    const result = run(['-c', 'all', '-v', 'reviewed', '--activate'], {
        B2C_FAIL_CARTRIDGE: 'app_pwakit_base'
    })
    expect(result.status).toBe(17)
    expect(calls().map(selectedCartridge)).toEqual(['app_pwakit_base'])
    expect(calls()[0].args).not.toContain('--activate')
    expect(result.stderr).toContain('remaining uploads skipped')
})

test('reports partial outcomes when the second upload fails', () => {
    createBoth()
    const result = run(['-c', 'all', '-v', 'reviewed'], {B2C_FAIL_CARTRIDGE: 'int_pwakit_hooks'})
    expect(result.status).toBe(17)
    expect(calls().map(selectedCartridge)).toEqual(ALL_CARTRIDGES)
    expect(result.stderr).toContain('Earlier uploads completed')
    expect(result.stderr).toContain('check remote state before retrying')
})

test('previews both commands with finalization only on the last command', () => {
    const sources = createBoth()
    const config = preflight()
    const result = run(['-c', 'all', '-v', 'reviewed', '--reload', '--dry-run'], config)
    expect(result.status).toBe(0)
    const preview = JSON.parse(result.stdout)
    expect(preview.cartridges).toEqual(ALL_CARTRIDGES)
    expect(preview.sources).toEqual(sources)
    expect(preview.commands.map((command) => command[3])).toEqual(sources)
    expect(preview.commands[0]).not.toContain('--reload')
    expect(preview.commands[1]).toContain('--reload')
    expect(calls()).toEqual([])
    expect(JSON.parse(fs.readFileSync(config.PREFLIGHT_CALLS))).toHaveLength(2)
})

test('uploads installed base and local hooks without a combined staging directory', () => {
    const template = path.join(root, 'node_modules/fixture-template')
    const base = cartridge(path.join(template, 'cartridges/app_pwakit_base'))
    fs.writeFileSync(path.join(template, 'package.json'), '{"name":"fixture-template"}')
    fs.writeFileSync(
        path.join(root, 'package.json'),
        '{"ccExtensibility":{"extends":"fixture-template"}}'
    )
    const hooks = cartridge(path.join(root, 'cartridges/int_pwakit_hooks'))
    const result = run(['-c', 'all', '-v', 'reviewed'])
    expect(result.status).toBe(0)
    expect(calls().map((call) => call.args[2])).toEqual([base, hooks])
})
