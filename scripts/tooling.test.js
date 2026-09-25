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

const {BUNDLE_PATH, bundleExists} = require('./check-bundle')
const {buildTargetUrl} = require('./deploy-status')

describe('tooling scripts', () => {
    test('checks for a client bundle from any platform', () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pwa-kit-bundle-'))
        expect(bundleExists(root)).toBe(false)

        fs.mkdirSync(path.join(root, 'build'))
        fs.writeFileSync(path.join(root, BUNDLE_PATH), '{}')
        expect(bundleExists(root)).toBe(true)

        fs.rmSync(root, {recursive: true, force: true})
    })

    test('encodes MRT project and target path segments', () => {
        expect(buildTargetUrl('project/name', 'target name').pathname).toBe(
            '/api/projects/project%2Fname/target/target%20name'
        )
    })
})
