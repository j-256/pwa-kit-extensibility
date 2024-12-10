import React from 'react'
import fetch from 'cross-fetch'
import { useQuery } from '@tanstack/react-query'
import { useParams } from 'react-router-dom'
import {getAppOrigin} from '@salesforce/pwa-kit-react-sdk/utils/url'
//import { HTTPError } from '@salesforce/pwa-kit-react-sdk/ssr/universal/errors'

const ContentDetails = () => {
    const params = useParams()
    const { data, error, isLoading } = useQuery([params.id],
        () => {
            return fetch(`${getAppOrigin()}/mobify/proxy/ocapi/s/RefArch/dw/shop/v20_2/content/${params.id}?client_id=6d17e164-4331-482a-908e-ff8d007f7782`)
                .then(res => res.json())
                .then((json) => {
                    console.log(json)
                    return json
                })
        })
    if (isLoading) {
        return <div>Loading...</div>
    }
    else if (error) {
        return <div>Error query hit: {error}</div>
    } else if (data.fault) {
        return <div>{data.fault.message}</div>
    } else {
        return <div dangerouslySetInnerHTML={{
            __html: data.c_body
        }} />
    }
}

ContentDetails.getTemplateName = () => 'content-details'

export default ContentDetails