import assert from 'node:assert/strict'
import {execFileSync, spawn} from 'node:child_process'
import {once} from 'node:events'
import {mkdir, rename, rm, writeFile} from 'node:fs/promises'
import {createServer} from 'node:net'
import {join} from 'node:path'
import {setTimeout as delay} from 'node:timers/promises'
import {fileURLToPath} from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))
const origin = 'http://localhost:3000'
const output = join(root, 'docs/screenshots/cover.png')
const staged = join(root, 'docs/screenshots/cover.tmp.png')
const args = process.argv.slice(2)
if (args.includes('-h') || args.includes('--help')) {
    console.log('Usage: node scripts/capture-cover.mjs\n\nBuild and capture the actual Womens category using the upstream public RefArch\ndemo catalog. Writes docs/screenshots/cover.png. Requires Node 22.9+ or 24,\nnpm ci, npx playwright install chromium, network access to the public demo,\nand free localhost port 3000. Private .env overlays and SLAS secrets are not used.\nDEPLOY_TARGET, NODE_ENV, HMR, and the SLAS secret are set internally for capture.\nExit status: 0 success, 1 capture failure, 2 usage error, 3 missing dependency.')
    process.exit(0)
}
if (args.length) {
    console.error('capture-cover: unexpected argument; see --help')
    process.exit(2)
}
const {chromium} = await import('playwright').catch((error) => {
    console.error(`capture-cover: run npm ci first: ${error.message}`)
    process.exit(3)
})
const environment = {
    ...process.env,
    DEPLOY_TARGET: 'cover',
    NODE_ENV: 'production',
    DEV_SERVER_PROTOCOL: 'http',
    PWA_KIT_SLAS_CLIENT_SECRET: '',
    HMR: 'false'
}
let server
let browser
let serverLog = ''
try {
    const portProbe = createServer()
    portProbe.listen(3000)
    await once(portProbe, 'listening')
    await new Promise((resolve, reject) => portProbe.close((error) => error ? reject(error) : resolve()))
    execFileSync('npm', ['run', 'build'], {
        cwd: root, env: environment, stdio: 'inherit', timeout: 300_000
    })
    server = spawn(process.execPath, ['scripts/cover-server.cjs'], {
        cwd: root, env: environment, stdio: ['ignore', 'pipe', 'pipe']
    })
    for (const stream of [server.stdout, server.stderr]) {
        stream.on('data', (chunk) => { serverLog = (serverLog + chunk).slice(-24_000) })
    }
    server.on('error', (error) => { serverLog += error.message })
    const deadline = Date.now() + 120_000
    while (!serverLog.includes('First build complete')) {
        if (server.exitCode !== null || Date.now() > deadline) throw new Error('Storefront build did not become ready')
        await delay(500)
    }
    browser = await chromium.launch()
    const page = await browser.newPage({
        viewport: {width: 1440, height: 1000}, deviceScaleFactor: 4,
        reducedMotion: 'reduce', locale: 'en-US'
    })
    page.setDefaultTimeout(60_000)
    const errors = []
    page.on('pageerror', (error) => errors.push(error.message))
    const response = await page.goto(`${origin}/category/womens`, {timeout: 90_000})
    assert.ok(response?.ok(), `Category returned HTTP ${response?.status()}`)
    await page.getByRole('button', {name: 'Decline tracking', exact: true}).click()
    await page.getByRole('button', {name: 'Decline tracking', exact: true}).waitFor({state: 'hidden'})
    await page.getByRole('heading', {name: /^Womens/}).waitFor()
    await page.waitForFunction(() => {
        const images = [...document.querySelectorAll('[data-testid="product-tile-image"] img')]
            .filter((image) => image.getBoundingClientRect().top < innerHeight)
        return images.length > 0 && images.every((image) => image.complete && image.naturalWidth > 0)
    })
    await page.evaluate(() => document.fonts.ready)
    assert.deepEqual(errors, [])
    await page.mouse.move(1439, 999)
    await mkdir(join(root, 'docs/screenshots'), {recursive: true})
    await writeFile(staged, await page.screenshot({animations: 'disabled'}))
    await rename(staged, output)
    console.log(`Captured public reference catalog: ${output}`)
} catch (error) {
    console.error(`capture-cover: ${error.stack ?? error}`)
    if (serverLog) console.error(serverLog)
    process.exitCode = /Executable doesn't exist|ERR_MODULE_NOT_FOUND/.test(error.message) ? 3 : 1
} finally {
    await browser?.close()
    if (server && server.exitCode === null) {
        const stopped = once(server, 'exit')
        server.kill('SIGTERM')
        const timer = setTimeout(() => server.kill('SIGKILL'), 10_000)
        await stopped
        clearTimeout(timer)
    }
    await rm(staged, {force: true})
}
