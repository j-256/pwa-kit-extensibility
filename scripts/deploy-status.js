/*
 * Copyright (c) 2025, Salesforce, Inc.
 * All rights reserved.
 * SPDX-License-Identifier: BSD-3-Clause
 * For full license text, see the LICENSE file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */
/* eslint-disable @typescript-eslint/no-var-requires */

const fs = require('fs')
const os = require('os')
const path = require('path')
const {parseArgs} = require('util')

// Managed Runtime API. The target endpoint reports the deployment `state` --
// the same source `pwa-kit-dev push --wait` polls
const MRT_ORIGIN = 'https://cloud.mobify.com'
const CREDENTIALS_PATH = path.join(os.homedir(), '.mobify')

const USAGE = `Usage: npm run deploy-status -- [options] <target>

Print the Managed Runtime deployment state for a target environment.

Arguments:
  <target>           MRT target environment to query (e.g. sbx)

Options:
  -s, --slug <slug>  project slug (default: the "name" field in package.json)
  -h, --help         show this help and exit

Environment:
  Reads MRT API credentials from ~/.mobify (JSON with "username" and "api_key"),
  the file written by "npm run save-credentials"

Exit status:
  0  deployment state retrieved and printed
  1  runtime failure (network error or non-OK API response)
  2  usage error, or missing/invalid credentials
`

// Write a diagnostic to stderr and exit with the given status
function fail(code, message) {
    process.stderr.write(`deploy-status: ${message}\n`)
    process.exit(code)
}

async function main() {
    let args
    try {
        args = parseArgs({
            allowPositionals: true,
            options: {
                slug: {type: 'string', short: 's'},
                help: {type: 'boolean', short: 'h'}
            }
        })
    } catch (error) {
        fail(2, `${error.message}; run with --help for usage`)
    }

    if (args.values.help) {
        process.stdout.write(USAGE)
        return
    }

    const [target, ...extra] = args.positionals
    if (!target) {
        fail(2, 'missing required <target> argument (e.g. sbx); run with --help for usage')
    }
    if (extra.length) {
        fail(2, `unexpected extra arguments: ${extra.join(' ')}`)
    }

    let slug = args.values.slug
    if (!slug) {
        try {
            slug = require(path.resolve(__dirname, '..', 'package.json')).name
        } catch (error) {
            fail(2, `could not read project slug from package.json: ${error.message}`)
        }
    }

    let credentials
    try {
        credentials = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, 'utf8'))
    } catch (error) {
        fail(
            2,
            `could not read credentials from ${CREDENTIALS_PATH} (run "npm run save-credentials"): ${error.message}`
        )
    }
    if (!credentials.username || !credentials.api_key) {
        fail(2, `credentials at ${CREDENTIALS_PATH} are missing "username" or "api_key"`)
    }

    const auth = Buffer.from(`${credentials.username}:${credentials.api_key}`).toString('base64')
    const url = new URL(`/api/projects/${slug}/target/${target}`, MRT_ORIGIN)

    let res
    try {
        res = await fetch(url, {headers: {Authorization: `Basic ${auth}`}})
    } catch (error) {
        fail(1, `request to ${url.href} failed: ${error.message}`)
    }
    if (!res.ok) {
        let detail = ''
        try {
            const text = await res.text()
            if (text) detail = `: ${text.slice(0, 300)}`
        } catch {
            // response body is best-effort; ignore read errors
        }
        fail(1, `MRT API returned ${res.status} ${res.statusText}${detail}`)
    }

    const data = await res.json()
    if (typeof data.state !== 'string') {
        fail(1, 'unexpected API response: no "state" field')
    }

    const host = data.ssr_external_hostname ? `  (${data.ssr_external_hostname})` : ''
    process.stdout.write(`${slug}/${target}: ${data.state}${host}\n`)
}

main().catch((error) => fail(1, error.message))
