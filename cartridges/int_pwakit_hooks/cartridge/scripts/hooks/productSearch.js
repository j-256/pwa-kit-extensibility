/* SPDX-License-Identifier: BSD-3-Clause */
/* global request */
/* eslint-disable @typescript-eslint/no-var-requires */

'use strict'

var SearchModel = require('dw/catalog/SearchModel')
var Logger = require('dw/system/Logger')
var Site = require('dw/system/Site')
var URLUtils = require('dw/web/URLUtils')
var URLParameter = require('dw/web/URLParameter')
var RESTResponseMgr = require('dw/system/RESTResponseMgr')

var SEARCH_QUERY_PARAMETER = 'q'
var ABSOLUTE_HTTPS_URL = /^https:\/\/([^/?#]+)(\/[^?#]*)?(?:\?[^#]*)?(?:#.*)?$/i
var logger = Logger.getLogger('pwakit-hooks', 'searchRedirect')

function createRedirectMapping(location, siteId, locale) {
    var destination = ABSOLUTE_HTTPS_URL.exec(location)
    if (!destination) return null

    var storefront = ABSOLUTE_HTTPS_URL.exec(URLUtils.https('Home-Show').toString())
    if (!storefront || destination[1].toLowerCase() !== storefront[1].toLowerCase()) return null

    var path = destination[2] || '/'
    var sitePrefix = '/s/' + siteId + '/'
    if (path.indexOf('/s/') === 0 && path.indexOf(sitePrefix) !== 0) return null
    if (path.indexOf(sitePrefix) === 0) path = path.slice(sitePrefix.length)
    path = path.replace(/^\//, '')

    var apiLocale = locale.replace(/_/g, '-')
    var segments = path.split('/')
    if (
        segments.length > 1 &&
        segments[0].replace(/_/g, '-').toLowerCase() === apiLocale.toLowerCase()
    ) {
        segments.shift()
    }
    var urlSegment = segments.join('/')
    if (!urlSegment) return null

    return {
        value: [
            RESTResponseMgr.createScapiRemoteInclude(
                'site',
                'shopper-seo',
                'v1',
                'url-mapping',
                new URLParameter('siteId', siteId),
                new URLParameter('locale', apiLocale),
                new URLParameter('urlSegment', urlSegment)
            )
        ]
    }
}

exports.modifyGETResponse = function (doc) {
    if (!request.isSCAPI()) return

    var parameters = request.httpParameterMap
    if (!parameters.isParameterSubmitted(SEARCH_QUERY_PARAMETER)) return

    var query = (parameters.get(SEARCH_QUERY_PARAMETER).stringValue || '').trim()
    if (!query) return

    var suggestions = doc.searchPhraseSuggestions

    var started = Date.now()
    var context = 'requestId={0} site={1} locale={2} outcome={3} elapsedMs={4}'
    var siteId = Site.getCurrent().ID
    try {
        var redirect = SearchModel.getSearchRedirect(query)
        var location = redirect && redirect.getLocation()
        if (!location || !location.trim()) {
            if (suggestions) {
                delete suggestions.c_isRedirect
                delete suggestions.c_redirectUrl
                delete suggestions.c_redirectMapping
            }
            logger.debug(
                context,
                request.requestID,
                siteId,
                request.locale,
                'no_match',
                Date.now() - started
            )
            return
        }

        var properties = {c_isRedirect: true, c_redirectUrl: location}
        try {
            var mapping = createRedirectMapping(location, siteId, request.locale)
            if (mapping) properties.c_redirectMapping = mapping
        } catch (includeError) {
            logger.warn(
                context + ' errorType={5}',
                request.requestID,
                siteId,
                request.locale,
                'mapping_setup_failed',
                Date.now() - started,
                includeError.name
            )
        }

        if (!suggestions) {
            doc.searchPhraseSuggestions = properties
        } else {
            suggestions.c_isRedirect = properties.c_isRedirect
            suggestions.c_redirectUrl = properties.c_redirectUrl
            if (properties.c_redirectMapping) {
                suggestions.c_redirectMapping = properties.c_redirectMapping
            } else {
                delete suggestions.c_redirectMapping
            }
        }
        logger.debug(
            context,
            request.requestID,
            siteId,
            request.locale,
            'matched',
            Date.now() - started
        )
    } catch (error) {
        logger.error(
            context + ' errorType={5}',
            request.requestID,
            siteId,
            request.locale,
            'lookup_failed',
            Date.now() - started,
            error.name
        )
    }
}
