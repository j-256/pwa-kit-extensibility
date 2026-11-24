/* SPDX-License-Identifier: BSD-3-Clause */
/* eslint-disable @typescript-eslint/no-var-requires */

const fs = require('fs')
const {spawnSync} = require('child_process')
const {parseArgs} = require('util')

const EXIT = Object.freeze({FAILURE: 1, USAGE: 2, DEPENDENCY: 3})
const PUBLIC_PATHS = ['*.md', '*.mdx', 'scripts/deploy-cartridge.js']
const RULES = [
    {
        name: 'Commerce tenant or organization ID',
        pattern: /\b(?:f_ecom_)?[a-z]{4}_(?:\d{3}|stg|prd|dev)\b/i
    },
    {
        name: 'instance-specific credential variable',
        pattern:
            /\b(?:WEBDAV_USER|WEBDAV_PASS|SCAPI_SHORTCODE)_[a-z]{4}(?:_(?:\d{3}|stg|prd|dev))?\b/i
    },
    {
        name: 'Commerce instance or API hostname',
        pattern:
            /\b(?:[a-z0-9-]+\.(?:dx|my|api)\.commercecloud\.salesforce\.com|[a-z0-9.-]+\.demandware\.net)\b/i
    },
    {name: 'UUID identifier', pattern: /\b[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}\b/i}
]
const USAGE = `Usage: node scripts/check-public-identifiers.js [--staged]

Check tracked Markdown and deployment CLI source for recognizable installation IDs.
Run from the repository root. Requires Node.js and Git; no npm dependencies.
Use portable placeholders in public examples. Diagnostics omit matched values.
This format check supplements review of arbitrary site names and other identifiers.
Regular-file reads require no-follow opens; use --staged if unavailable.
Use --staged when parent directories can be replaced concurrently.

Options:
  --staged    read the index instead of working-tree contents
  -h, --help  show help

Exit status: 0 clean, 1 identifiers or runtime failure, 2 usage, 3 Git missing
`

function git(args) {
    const result = spawnSync('git', args, {encoding: 'utf8'})
    if (result.error?.code === 'ENOENT') {
        throw Object.assign(new Error('Git is required'), {exitCode: EXIT.DEPENDENCY})
    }
    if (result.error || result.status !== 0) throw new Error('Unable to read repository index')
    return result.stdout
}

function redact(text) {
    return RULES.reduce(
        (result, rule) => result.replace(new RegExp(rule.pattern.source, 'gi'), '<redacted>'),
        text
    )
}

function readWorkingTree(file) {
    try {
        return fs.readlinkSync(file)
    } catch (error) {
        if (error.code !== 'EINVAL') throw error
    }
    if (!Number.isInteger(fs.constants.O_NOFOLLOW) || !Number.isInteger(fs.constants.O_NONBLOCK)) {
        throw Object.assign(new Error('Required file-open flags unavailable; use --staged'), {
            exitCode: EXIT.USAGE
        })
    }
    const descriptor = fs.openSync(
        file,
        fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK
    )
    try {
        if (!fs.fstatSync(descriptor).isFile()) throw new Error('Unsupported public file type')
        return fs.readFileSync(descriptor, 'utf8')
    } finally {
        fs.closeSync(descriptor)
    }
}

function main() {
    let values
    try {
        ;({values} = parseArgs({
            options: {staged: {type: 'boolean'}, help: {type: 'boolean', short: 'h'}}
        }))
    } catch {
        throw Object.assign(new Error('Invalid arguments; use --help'), {exitCode: EXIT.USAGE})
    }
    if (values.help) {
        process.stdout.write(USAGE)
        return 0
    }
    const files = git(['ls-files', '-z', '--', ...PUBLIC_PATHS])
        .split('\0')
        .filter(Boolean)
    const failures = []
    for (const file of files) {
        const publicPath = redact(file)
        for (const rule of RULES) {
            if (rule.pattern.test(file)) {
                failures.push(`${publicPath}: ${rule.name} in public filename; use a portable name`)
            }
        }
        let content
        try {
            if (values.staged) {
                content = git(['show', `:${file}`])
            } else {
                content = readWorkingTree(file)
            }
        } catch (error) {
            if (!values.staged && error.code === 'ENOENT') continue
            throw error
        }
        content.split('\n').forEach((line, index) => {
            for (const rule of RULES) {
                if (rule.pattern.test(line))
                    failures.push(
                        `${publicPath}:${index + 1}: ${rule.name}; use a portable placeholder`
                    )
            }
        })
    }
    if (failures.length) {
        process.stderr.write(failures.join('\n') + '\n')
        return EXIT.FAILURE
    }
    process.stdout.write('Public documentation identifier check passed\n')
    return 0
}

try {
    process.exitCode = main()
} catch (error) {
    process.stderr.write(`check-public-identifiers: ${redact(error.message)}\n`)
    process.exitCode = error.exitCode || EXIT.FAILURE
}
