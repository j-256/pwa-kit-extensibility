# PWA Kit SCAPI hooks

`int_pwakit_hooks` owns this project's Commerce API hook customizations. Keep additional hooks in this cartridge and register their scripts in `hooks.json`. The upstream `app_pwakit_base` cartridge remains the owner of upstream email functionality.

## Search-driven redirects

The `dw.ocapi.shop.product_search.modifyGETResponse` hook calls the static [`SearchModel.getSearchRedirect(q)`](https://developer.salesforce.com/docs/commerce/b2c-commerce/references/b2c-script-api/dw.catalog.SearchModel.html) lookup for a nonempty, trimmed keyword query. Business Manager owns keyword matching, online state, locale selection, and the calculated destination. The hook only customizes SCAPI requests, despite its shared OCAPI extension point name.

A matching response keeps HTTP 200 and the normal search document, adding:

```json
{
    "searchPhraseSuggestions": {
        "c_isRedirect": true,
        "c_redirectUrl": "https://commerce.example/s/YourSite/product.html"
    }
}
```

Existing suggestions, hits, totals, limits, refinements, sorting, and unrelated custom properties are preserved. No match produces no redirect metadata. Absent or whitespace-only keywords and category-only requests leave the response unchanged. The hook returns no value, allowing subsequent hooks to run. Lookup failures retain normal results and log a correlated error. See [hook return semantics](https://developer.salesforce.com/docs/commerce/commerce-api/guide/extensibility_via_hooks.html) and [custom properties on Suggestion documents](https://developer.salesforce.com/docs/commerce/commerce-api/guide/custom-properties.html).

This cartridge does not issue a browser HTTP redirect or provide PWA navigation. The destination status returned by the Script API lookup does not change the product-search HTTP status. The PWA must eventually resolve and navigate to the destination, falling back to the retained search results when resolution fails.

## Installation and release

1. Inspect the target's active code version and site cartridge path. Review other registrations for this extension point, especially earlier hooks that return a value and stop the chain.
2. Upload to an explicitly selected code version. Upload alone does not activate code or change configuration:

    ```bash
    npm run deploy:cartridge -- --cartridge int_pwakit_hooks --instance sandbox --code-version reviewed-version --dry-run
    npm run deploy:cartridge -- --cartridge int_pwakit_hooks --instance sandbox --code-version reviewed-version
    ```

3. Replace `sandbox` and `reviewed-version` with the intended connection and code version. Add `int_pwakit_hooks` to the target site's custom cartridge path, preserving existing entries. Ensure its position allows it to execute before any hook that intentionally terminates this extension point. Enable API hook execution in Administration > Global Preferences > Feature Switches if required. These are separate configuration changes from code upload.
4. Configure merchant rules under the site > Merchant Tools > Search > Search Driven Redirects. Select the keyword language, mark the rule Online, choose a product, category, content, pipeline, or URL action, and apply the changes. Test locale-specific keywords and their fallback chain. The platform owns matching; the hook adds no independent matcher. See [Search Redirects](https://help.salesforce.com/s/articleView?id=cc.b2c_managing_search_redirects.htm&type=5).
5. Verify directly against shopper SCAPI on a sandbox before frontend changes. Use a shopper token for the target tenant and channel. Keep tokens in memory and out of logs and shell history.
6. For release, upload the reviewed cartridge to the intended code version on staging, register it for the intended site, and verify the hook and merchant rules there. Promote that code version to production through Code Replication started in Business Manager. Do not upload directly to production.
7. Verify production prerequisites independently: cartridge path, API hook execution, merchant search rules, locale configuration, and shopper scopes. Code Replication is not evidence that site configuration or merchant data has been transferred. Arrange the applicable data replication or BM configuration separately and verify production SCAPI after promotion.

## Relationship to a URL fallback

Search-driven redirects select a destination from a keyword. A future catch-all route would resolve an incoming URL using Shopper SEO [`getUrlMapping`](https://developer.salesforce.com/docs/commerce/commerce-api/guide/url-resolution.html) after explicit application routes have failed. That API applies URL rules and URL redirects; it does not replace search-keyword matching. No SEO hook or catch-all route is required to add this search hook.

Both flows can eventually share destination validation, site/locale-aware path normalization, mapping requests, resource-to-route conversion, redirect-chain limits, and diagnostics. The Script API lookup exposes a URL and status, not a destination resource ID. For internal Commerce destinations, keep the prescribed product-search response followed by a shopper URL-mapping request. Do not infer IDs from URL segments, use `URLRedirectMgr` as an arbitrary URL resolver, or add a hook-to-SCAPI network request.

The shared PWA resolver lives in `overrides/app/utils/commerce-destination.js`. It accepts an authenticated `getUrlMapping` callback and the application's site/locale URL builder. It strips the selected site's `/s/{siteId}/` prefix and configured supported locale IDs or aliases, including hyphen/underscore locale variants, without decoding the remaining SEO path. Lowercase and uppercase product/category resource types are supported. Category refinements become `refine` query parameters; content and pipeline destinations retain the search page.

Explicit `commerceOrigins` identify trusted Commerce origins. Relative destinations use the application origin. An unrelated origin is never mapped into a local resource, even when its path resembles a Commerce site URL. External navigation is restricted to HTTPS origins explicitly listed in `externalOrigins`; the default external allowlist is empty. Protocol-relative URLs, credentials in URLs, unsafe schemes, control characters, and malformed encoding are rejected.

URI redirects without resource IDs can require another mapping request. The resolver follows at most five mappings, detects repeated locale/path pairs, and supports redirect statuses 301, 302, and 307, including string values. It preserves destination query strings and fragments, copies source parameters only when requested, and adds missing parameter pairs without duplicating additions already present in `destinationUrl`. A resource redirect uses its mapped ID directly. These mapping statuses describe the merchant redirect; they do not change the search response's HTTP status. Search-to-search destinations are rejected to prevent navigation loops.

Keep URL mapping outside the response hook so an optional destination lookup cannot fail an otherwise valid search. A SCAPI remote include can save a client round trip, but its deferred execution means the hook cannot catch an included request failure. Most non-200 include responses other than 404 cause the entire search request to return HTTP 500; the latency benefit does not justify that failure coupling. See [`RemoteInclude` error handling](https://developer.salesforce.com/docs/commerce/b2c-commerce/references/b2c-script-api/dw.system.RemoteInclude.html).

Mapping requires `sfcc.shopper-seo` on the SLAS client. Preserve destination query strings and fragments separately: `urlSegment` takes the path, and its documented form has no leading slash or query string. Normalize only known site prefixes and verified locale prefixes; do not turn untrusted origins into internal routes. Check the target's actual `resourceType` values: the installed SDK declares uppercase values, while some published examples and older responses use lowercase. Product/category mappings, category refinements, content asset subtypes, and URI redirects need explicit handling. URI redirects can lack resource IDs. Inspect `destinationUrl`, `statusCode`, `copySourceParams`, and `additionalUrlParams` before building a route.

## Verification and troubleshooting

Run the focused boundary tests and static checks:

```bash
npm test -- -- --watch=false --coverage=false --runTestsByPath tests/cartridges/product-search.test.js scripts/deploy-cartridge.test.js
npx eslint cartridges/int_pwakit_hooks/cartridge/scripts/hooks/productSearch.js tests/cartridges/product-search.test.js scripts/deploy-cartridge.js scripts/deploy-cartridge.test.js
```

Use direct product-search requests to compare a matching online rule, a normal unmatched query, an offline rule, an absent/empty keyword with a category refinement, and different enabled locales. A matching query with multiple hits must retain those hits, totals, sorting, and refinements. Verify product/category destinations with Shopper SEO separately; a correct search response does not prove that mapping permissions or frontend routes are configured.

Product-search responses, including hook-added properties, can be cached. Use a unique `c_debug` query parameter for controlled diagnostics, not ordinary traffic. Inspect available `sfdc_cache_status`, `sfdc_cdn_cache_status`, and `sfdc_customization` headers. CDN BYPASS alone does not establish a web-tier miss. Imported or edited merchant configuration can take time to become visible; verify saved rules, locale, and fresh responses before prescribing index rebuilds or broad cache invalidation.

The logger file prefix is `pwakit-hooks`, with category `searchRedirect`. Debug messages record match/no-match outcome, request ID, site, locale, and elapsed milliseconds; enable debug selectively during diagnosis. Errors record the same context and error type. Query text, destination URLs, tokens, and per-hit success messages are excluded. Request-scoped logs describe executed hook lookups, not cache-served request totals.

If a redirect is absent, inspect the actual tenant/site/locale, BM rule, hook feature switch, active code version, cartridge order, and direct SCAPI response. If metadata exists but mapping fails, inspect the shopper scope, normalized path, locale, and mapping response. A 403 from Shopper SEO is a separate authorization problem from keyword selection; an unsupported locale can be rejected before the hook executes.

Normalize known configured locale prefixes before URL mapping, preserve meaningful encoding, and test product and category paths independently. A product mapping can accept a locale prefix that causes a category mapping to return 404. Successful mapping on one site's URL rules does not establish support for another site's paths.
