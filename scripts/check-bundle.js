#!/usr/bin/env node
/*
 * Copyright (c) 2025, Salesforce, Inc.
 * All rights reserved.
 * SPDX-License-Identifier: BSD-3-Clause
 * For full license text, see the LICENSE file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */
/* eslint-disable @typescript-eslint/no-var-requires */

const fs = require('fs')
const path = require('path')

const BUNDLE_PATH = path.join('build', 'loadable-stats.json')

function bundleExists(root = process.cwd()) {
    return fs.existsSync(path.join(root, BUNDLE_PATH))
}

function main() {
    if (bundleExists()) return

    process.stderr.write(
        `check-bundle: ${BUNDLE_PATH} is missing (client bundle was skipped; ensure overrides/app/main.jsx exists)\n`
    )
    process.exitCode = 1
}

if (require.main === module) main()

module.exports = {BUNDLE_PATH, bundleExists}
