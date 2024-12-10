import React from 'react'
import { useQuery } from '@tanstack/react-query'
import { List, ListItem } from '@chakra-ui/react'
import Link from '@salesforce/retail-react-app/app/components/link'
import {getAppOrigin} from '@salesforce/pwa-kit-react-sdk/utils/url'

const ContentSearch = (props) => {
    // Fetch the translation message data using the target locale.
    const { data: contentResult, isLoading } = useQuery({
        queryKey: ['content_search', 'about'],
        queryFn: async () => {
            const res = await fetch(
                `${getAppOrigin()}/mobify/proxy/ocapi/s/RefArch/dw/shop/v20_2/content_search?q=about&client_id=6d17e164-4331-482a-908e-ff8d007f7782`
            )
            return await res.json()
        }
    })
    return (
        <div>
            {isLoading ?
                <div>Loading...</div> :
                <div>
                    {contentResult?.hits?.length ? (
                        <List>
                            {contentResult.hits.map(({ id, name }) => (
                                <Link key={id} to={`/content/${id}`}>
                                    <ListItem>{name}</ListItem>
                                </Link>
                            ))}
                        </List>
                    ) : (
                        <div>No Content Items Found!</div>
                    )}
                </div>
            }
        </div>
    )
}

ContentSearch.getTemplateName = () => 'content-search'

export default ContentSearch