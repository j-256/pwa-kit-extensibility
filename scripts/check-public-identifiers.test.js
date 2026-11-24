/* SPDX-License-Identifier: BSD-3-Clause */
/* eslint-disable @typescript-eslint/no-var-requires */

const fs = require('fs')
const os = require('os')
const path = require('path')
const {spawnSync} = require('child_process')

const SCRIPT = path.join(__dirname, 'check-public-identifiers.js')
let root
let environment

function git(...args) {
    const result = spawnSync('git', args, {cwd: root, env: environment, encoding: 'utf8'})
    if (result.status !== 0) throw new Error(result.stderr)
}

function write(relativePath, text) {
    const filename = path.join(root, relativePath)
    fs.mkdirSync(path.dirname(filename), {recursive: true})
    fs.writeFileSync(filename, text)
}

function check(...args) {
    return spawnSync(process.execPath, [SCRIPT, ...args], {
        cwd: root,
        env: environment,
        encoding: 'utf8'
    })
}

beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'public-identifiers-'))
    environment = Object.fromEntries(
        Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_'))
    )
    git('init', '--quiet')
})

afterEach(() => fs.rmSync(root, {recursive: true, force: true}))

test.each(['-h', '--help'])('shows help without needing Git state: %s', (flag) => {
    environment.PATH = ''
    const result = check(flag)
    expect(result.status).toBe(0)
    expect(result.stdout).toContain('--staged')
    expect(result.stderr).toBe('')
})

test.each([
    'abcd_123',
    'f_ecom_abcd_stg',
    'WEBDAV_USER_abcd_123',
    'SCAPI_SHORTCODE_abcd',
    'https://abcd-123.dx.commercecloud.salesforce.com',
    'https://abc12345.api.commercecloud.salesforce.com',
    'https://staging-abcd.example.demandware.net',
    '12345678-1234-4234-8234-123456789abc'
])('rejects recognizable installation identifiers without printing them: %s', (identifier) => {
    write('docs/setup.md', `# Setup\n\nUse ${identifier}\n`)
    git('add', 'docs/setup.md')
    const result = check()
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('docs/setup.md:3:')
    expect(result.stderr).not.toContain(identifier)
})

test('accepts portable examples while leaving intentional runtime config and fixtures outside scope', () => {
    write(
        'README.md',
        'Use sandbox, staging, ExampleSite, commerce.example, and YOUR_ORGANIZATION_ID\n'
    )
    write('config/default.js', "const organizationId = 'f_ecom_abcd_123'\n")
    write('scripts/example.test.js', "const instance = 'abcd_123'\n")
    git('add', 'README.md', 'config/default.js', 'scripts/example.test.js')
    expect(check().status).toBe(0)
})

test('checks the staged document instead of a sanitized unstaged replacement', () => {
    write('README.md', 'Use abcd_123\n')
    git('add', 'README.md')
    write('README.md', 'Use sandbox\n')
    expect(check().status).toBe(0)
    expect(check('--staged').status).toBe(1)
})

test('checks deployment help source as a public surface', () => {
    write('scripts/deploy-cartridge.js', 'const USAGE = "Use abcd_123"\n')
    git('add', 'scripts/deploy-cartridge.js')
    expect(check('--staged').status).toBe(1)
})

test('rejects identifiers in public filenames and redacts filenames in diagnostics', () => {
    write('docs/abcd_123.md', 'Use efgh_456\n')
    git('add', 'docs/abcd_123.md')
    const result = check('--staged')
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('public filename')
    expect(result.stderr).not.toContain('abcd_123')
    expect(result.stderr).not.toContain('efgh_456')
})

test('scans a Markdown symlink as link text without reading its external target', () => {
    const external = fs.mkdtempSync(path.join(os.tmpdir(), 'external-public-docs-'))
    try {
        const filename = path.join(external, 'private.txt')
        fs.writeFileSync(filename, 'Use abcd_123\n')
        fs.symlinkSync(filename, path.join(root, 'README.md'))
        git('add', 'README.md')
        expect(check().status).toBe(0)
        expect(check('--staged').status).toBe(0)
    } finally {
        fs.rmSync(external, {recursive: true, force: true})
    }
})

test('rejects a commit containing identifiers through the real Git hook', () => {
    write('scripts/check-public-identifiers.js', fs.readFileSync(SCRIPT, 'utf8'))
    write(
        '.githooks/pre-commit',
        fs.readFileSync(path.join(__dirname, '../.githooks/pre-commit'), 'utf8')
    )
    fs.chmodSync(path.join(root, '.githooks/pre-commit'), 0o755)
    write('README.md', 'Use abcd_123\n')
    git('add', 'README.md')
    const result = spawnSync(
        'git',
        [
            '-c',
            'core.hooksPath=.githooks',
            '-c',
            'user.name=Fixture',
            '-c',
            'user.email=fixture@example.com',
            '-c',
            'commit.gpgsign=false',
            'commit',
            '-m',
            'fixture',
            '--',
            'README.md'
        ],
        {cwd: root, env: environment, encoding: 'utf8'}
    )
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('README.md:1:')
    expect(result.stderr).not.toContain('abcd_123')
})

test('reports a missing Git dependency distinctly', () => {
    environment.PATH = ''
    expect(check().status).toBe(3)
})

test('rejects unsupported options as usage errors', () => {
    expect(check('--unknown').status).toBe(2)
})

test('fails closed when a document is replaced with a symlink before reading', () => {
    const external = fs.mkdtempSync(path.join(os.tmpdir(), 'external-public-docs-'))
    try {
        const target = path.join(external, 'private.txt')
        fs.writeFileSync(target, 'Outside target must never be read\n')
        write('README.md', 'Use sandbox\n')
        git('add', 'README.md')
        const preload = path.join(root, 'replace-document.cjs')
        fs.writeFileSync(
            preload,
            `
            const fs = require('fs')
            const open = fs.openSync
            const read = fs.readFileSync
            let replaced = false
            function replace(file) {
                if (file !== 'README.md' || replaced) return
                replaced = true
                fs.unlinkSync(file)
                fs.symlinkSync(process.env.PUBLIC_GUARD_TEST_TARGET, file)
            }
            fs.openSync = (file, ...args) => {replace(file); return open(file, ...args)}
            fs.readFileSync = (file, ...args) => {replace(file); return read(file, ...args)}
        `
        )
        const result = spawnSync(process.execPath, ['--require', preload, SCRIPT], {
            cwd: root,
            env: {...environment, PUBLIC_GUARD_TEST_TARGET: target},
            encoding: 'utf8'
        })
        expect(result.status).toBe(1)
        expect(result.stdout).not.toContain('passed')
        expect(result.stderr).toContain('ELOOP')
        expect(result.stderr).not.toContain('Outside target')
    } finally {
        fs.rmSync(external, {recursive: true, force: true})
    }
})

test('continues to skip a tracked document removed from the working tree', () => {
    write('README.md', 'Use sandbox\n')
    git('add', 'README.md')
    fs.unlinkSync(path.join(root, 'README.md'))
    expect(check().status).toBe(0)
    expect(check('--staged').status).toBe(0)
})
