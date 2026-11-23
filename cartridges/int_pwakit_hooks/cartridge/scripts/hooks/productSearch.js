/* SPDX-License-Identifier: BSD-3-Clause */
/* global request */
/* eslint-disable @typescript-eslint/no-var-requires */

'use strict'

var SearchModel = require('dw/catalog/SearchModel')
var Logger = require('dw/system/Logger')
var Site = require('dw/system/Site')

var SEARCH_QUERY_PARAMETER = 'q'
var logger = Logger.getLogger('pwakit-hooks', 'searchRedirect')

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

        if (!suggestions) {
            doc.searchPhraseSuggestions = {
                c_isRedirect: true,
                c_redirectUrl: location
            }
        } else {
            suggestions.c_isRedirect = true
            suggestions.c_redirectUrl = location
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
