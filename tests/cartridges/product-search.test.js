/* SPDX-License-Identifier: BSD-3-Clause */
/* eslint-disable @typescript-eslint/no-var-requires */

const fs = require('fs')
const path = require('path')
const vm = require('vm')

const CARTRIDGE_ROOT = path.join(__dirname, '../../cartridges/int_pwakit_hooks')
const PRODUCT_URL = 'https://sandbox.example/s/RefArch/dresses/red.html?source=search#details'

function loadHook({query = 'dress', scapi = true, destination = PRODUCT_URL, failure} = {}) {
    const manifest = JSON.parse(fs.readFileSync(path.join(CARTRIDGE_ROOT, 'package.json')))
    const registryPath = path.resolve(CARTRIDGE_ROOT, manifest.hooks)
    const {hooks} = JSON.parse(fs.readFileSync(registryPath))
    const registration = hooks.find(
        ({name}) => name === 'dw.ocapi.shop.product_search.modifyGETResponse'
    )
    const logs = []
    const logger = Object.fromEntries(
        ['debug', 'error', 'warn'].map((level) => [level, (...args) => logs.push({level, args})])
    )
    const context = {
        exports: {},
        request: {
            isSCAPI: () => scapi,
            requestID: 'fixture-request',
            locale: 'en_US',
            httpParameterMap: {
                isParameterSubmitted: () => query !== undefined && query !== null,
                get: () => ({stringValue: query})
            }
        },
        require: (id) => {
            if (id === 'dw/catalog/SearchModel') {
                return {
                    getSearchRedirect: (phrase) => {
                        if (failure) throw failure
                        return phrase === 'dress' && destination !== null
                            ? {getLocation: () => destination}
                            : null
                    }
                }
            }
            if (id === 'dw/system/Logger') return {getLogger: () => logger}
            if (id === 'dw/system/Site') return {getCurrent: () => ({ID: 'RefArch'})}
            throw new Error(`Unexpected platform dependency: ${id}`)
        }
    }
    vm.runInNewContext(
        fs.readFileSync(path.resolve(path.dirname(registryPath), registration.script), 'utf8'),
        context
    )
    return {hook: context.exports.modifyGETResponse, logs}
}

function searchDocument() {
    return {
        query: 'dress',
        hits: [{productId: 'red-dress', c_existing: 'keep'}],
        total: 11,
        limit: 15,
        offset: 0,
        refinements: [{attributeId: 'color'}],
        sortingOptions: [{id: 'best-matches'}],
        searchPhraseSuggestions: {suggestedPhrases: [], c_existing: 'keep'},
        c_existing: 'keep'
    }
}

test('adds matched metadata while retaining the normal search payload and hook chain', () => {
    const {hook, logs} = loadHook({query: '  dress  '})
    const doc = searchDocument()
    const original = JSON.parse(JSON.stringify(doc))
    expect(hook(doc)).toBeUndefined()
    expect(doc).toEqual({
        ...original,
        searchPhraseSuggestions: {
            ...original.searchPhraseSuggestions,
            c_isRedirect: true,
            c_redirectUrl: PRODUCT_URL
        }
    })
    expect(JSON.stringify(logs)).not.toContain(PRODUCT_URL)
    expect(JSON.stringify(logs)).not.toContain('dress')
})

test.each([null, '', '   ', 'unmatched'])(
    'leaves normal results untouched for query %j',
    (query) => {
        const {hook} = loadHook({query})
        const doc = searchDocument()
        const original = JSON.parse(JSON.stringify(doc))
        expect(hook(doc)).toBeUndefined()
        expect(doc).toEqual(original)
    }
)

test('does not add SCAPI metadata to an OCAPI response', () => {
    const {hook} = loadHook({scapi: false})
    const doc = searchDocument()
    const original = JSON.parse(JSON.stringify(doc))
    expect(hook(doc)).toBeUndefined()
    expect(doc).toEqual(original)
})

test.each([undefined, null])('creates missing suggestions only for a match: %j', (suggestions) => {
    const {hook} = loadHook()
    const doc = {...searchDocument(), searchPhraseSuggestions: suggestions}
    hook(doc)
    expect(doc.searchPhraseSuggestions).toEqual({
        c_isRedirect: true,
        c_redirectUrl: PRODUCT_URL
    })
})

test('populates missing suggestions before a platform setter copies the assigned object', () => {
    const {hook} = loadHook()
    const doc = searchDocument()
    let suggestions
    Object.defineProperty(doc, 'searchPhraseSuggestions', {
        get: () => suggestions,
        set: (value) => {
            suggestions = JSON.parse(JSON.stringify(value))
        }
    })
    hook(doc)
    expect(doc.searchPhraseSuggestions).toEqual({
        c_isRedirect: true,
        c_redirectUrl: PRODUCT_URL
    })
})

test.each([null, '', '   '])('does not expose an empty destination: %j', (destination) => {
    const {hook} = loadHook({destination})
    const doc = searchDocument()
    const original = JSON.parse(JSON.stringify(doc))
    expect(hook(doc)).toBeUndefined()
    expect(doc).toEqual(original)
})

test('does not carry matched metadata into an unmatched response', () => {
    const doc = searchDocument()
    loadHook().hook(doc)
    loadHook({query: 'unmatched'}).hook(doc)
    expect(doc.searchPhraseSuggestions).toEqual({suggestedPhrases: [], c_existing: 'keep'})
})

test('retains results and logs a correlated failure without exposing query text', () => {
    const {hook, logs} = loadHook({failure: new Error('private query detail')})
    const doc = searchDocument()
    doc.searchPhraseSuggestions.c_isRedirect = true
    doc.searchPhraseSuggestions.c_redirectUrl = PRODUCT_URL
    const original = JSON.parse(JSON.stringify(doc))
    expect(hook(doc)).toBeUndefined()
    expect(doc).toEqual(original)
    const errors = logs.filter(({level}) => level === 'error')
    expect(errors).toHaveLength(1)
    const message = JSON.stringify(errors)
    expect(message).toContain('fixture-request')
    expect(message).toContain('RefArch')
    expect(message).toContain('en_US')
    expect(message).not.toContain('private query detail')
})
