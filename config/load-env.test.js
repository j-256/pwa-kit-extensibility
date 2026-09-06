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
const {loadEnv} = require('./load-env')

const tmpDirs = []

// Write a throwaway directory of .env files and return its path
function fixture(files) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'load-env-'))
    tmpDirs.push(dir)
    for (const [name, content] of Object.entries(files)) {
        fs.writeFileSync(path.join(dir, name), content)
    }
    return dir
}

afterEach(() => {
    while (tmpDirs.length) fs.rmSync(tmpDirs.pop(), {recursive: true, force: true})
})

test('fills DEPLOY_TARGET from the base .env when the environment does not set it', () => {
    const dir = fixture({'.env': 'DEPLOY_TARGET=sbx'})
    const env = {}
    loadEnv({dir, env})
    expect(env.DEPLOY_TARGET).toBe('sbx')
})

test('leaves a DEPLOY_TARGET already set in the environment untouched', () => {
    const dir = fixture({'.env': 'DEPLOY_TARGET=sbx'})
    const env = {DEPLOY_TARGET: 'production'}
    loadEnv({dir, env})
    expect(env.DEPLOY_TARGET).toBe('production')
})

test('forces the SLAS secret from the target overlay over an ambient value, expanding from the environment', () => {
    const dir = fixture({
        '.env': 'DEPLOY_TARGET=sbx',
        '.env.sbx': 'PWA_KIT_SLAS_CLIENT_SECRET=tok-${SLAS_SRC}'
    })
    const env = {SLAS_SRC: 'shellsrc', PWA_KIT_SLAS_CLIENT_SECRET: 'ambient-stale'}
    loadEnv({dir, env})
    expect(env.PWA_KIT_SLAS_CLIENT_SECRET).toBe('tok-shellsrc')
})

test('selects the overlay by the environment target over the base .env target', () => {
    const dir = fixture({
        '.env': 'DEPLOY_TARGET=sbx',
        '.env.default': 'PWA_KIT_SLAS_CLIENT_SECRET=prd-${PRD_SRC}'
    })
    const env = {DEPLOY_TARGET: 'default', PRD_SRC: 'prdsrc'}
    loadEnv({dir, env})
    expect(env.DEPLOY_TARGET).toBe('default')
    expect(env.PWA_KIT_SLAS_CLIENT_SECRET).toBe('prd-prdsrc')
})

test('does not clobber an ambient secret when the overlay expansion resolves empty', () => {
    const dir = fixture({
        '.env': 'DEPLOY_TARGET=sbx',
        '.env.sbx': 'PWA_KIT_SLAS_CLIENT_SECRET=${MISSING_SOURCE}'
    })
    const env = {PWA_KIT_SLAS_CLIENT_SECRET: 'ambient-good'}
    loadEnv({dir, env})
    expect(env.PWA_KIT_SLAS_CLIENT_SECRET).toBe('ambient-good')
})

test('is a no-op when no .env files are present', () => {
    const dir = fixture({})
    const env = {FOO: 'bar'}
    loadEnv({dir, env})
    expect(env).toEqual({FOO: 'bar'})
})
