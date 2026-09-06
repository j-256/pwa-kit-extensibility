/*
 * Copyright (c) 2025, Salesforce, Inc.
 * All rights reserved.
 * SPDX-License-Identifier: BSD-3-Clause
 * For full license text, see the LICENSE file in the repo root or https://opensource.org/licenses/BSD-3-Clause
 */
/* eslint-disable @typescript-eslint/no-var-requires */

const fs = require('fs')
const path = require('path')
const dotenv = require('dotenv')
const dotenvExpand = require('dotenv-expand')

// Keys whose .env value must win over an ambient shell export (e.g. a stale
// PWA_KIT_SLAS_CLIENT_SECRET left in the environment). Every other key only
// fills in when unset, so an explicit `VAR=x npm start` still overrides the file
const FORCE_FROM_FILE = new Set(['PWA_KIT_SLAS_CLIENT_SECRET'])

// Overlay target used when DEPLOY_TARGET is unset, mirroring getConfig's fallback
// to config/default.js so the .env overlay lines up with the config that loads
const DEFAULT_TARGET = 'default'

function parseFileIfPresent(filePath) {
    return fs.existsSync(filePath) ? dotenv.parse(fs.readFileSync(filePath, 'utf8')) : {}
}

/**
 * Load `.env` plus the resolved target overlay `.env.<DEPLOY_TARGET>` into the
 * environment, for local development (`npm start` via dev-server.js).
 *
 * Precedence, per key:
 *  - keys in FORCE_FROM_FILE: the file value wins over the environment, unless
 *    it expands to an empty string (so a missing source var never wipes a good
 *    ambient value)
 *  - every other key: applied only when the environment does not already set it,
 *    so an explicit `VAR=x npm start` still wins
 *
 * `${VAR}` references expand from the environment (e.g. a shell-exported secret),
 * so no secret value has to live in the file. Keys defined by the files are
 * hidden from expansion so an ambient value cannot shadow a file's own
 * definition of that key.
 *
 * @param {object} [opts]
 * @param {string} [opts.dir] directory holding the .env files (default: repo root)
 * @param {NodeJS.ProcessEnv} [opts.env] environment to read and mutate (default: process.env)
 */
function loadEnv({dir = path.resolve(__dirname, '..'), env = process.env} = {}) {
    const base = parseFileIfPresent(path.join(dir, '.env'))
    const target = env.DEPLOY_TARGET || base.DEPLOY_TARGET || DEFAULT_TARGET
    const overlay = parseFileIfPresent(path.join(dir, `.env.${target}`))
    const merged = {...base, ...overlay}
    if (Object.keys(merged).length === 0) return

    // Expand ${VAR} from the environment, hiding the file-defined keys so an
    // ambient value cannot shadow the file's own definition during expansion
    const forExpand = {...env}
    for (const key of Object.keys(merged)) delete forExpand[key]
    const {parsed: expanded} = dotenvExpand.expand({parsed: {...merged}, processEnv: forExpand})

    for (const [key, value] of Object.entries(expanded)) {
        if (FORCE_FROM_FILE.has(key)) {
            if (value !== '') env[key] = value
        } else if (env[key] == null || env[key] === '') {
            env[key] = value
        }
    }
}

module.exports = {loadEnv, FORCE_FROM_FILE, DEFAULT_TARGET}
