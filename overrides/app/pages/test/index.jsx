import React, {useMemo, useState} from 'react'
import {useLocation} from 'react-router-dom'
import {useIntl} from 'react-intl'
import {
    Box,
    Text,
    Heading,
    Stack,
    Skeleton,
    Button
} from '@salesforce/retail-react-app/app/components/shared/ui'
// Direct @chakra-ui/react imports break hydration in extensible template (separate instance from ChakraProvider)
const Code = (props) => (
    <Box as="code" px={1} bg="gray.100" borderRadius="sm" fontSize="sm" {...props} />
)
//import useEinstein from '@salesforce/retail-react-app/app/hooks/use-einstein'
import useMultiSite from '@salesforce/retail-react-app/app/hooks/use-multi-site'
import {useProductSearch, useDNT} from '@salesforce/commerce-sdk-react'

const SLOW_REQUEST_DURATION = 3000

const ROOT_CATEGORY_ID = 'root'
const SEARCH_LIMIT = 10

const TestPage = () => {
    const {search, pathname} = useLocation()
    const {locale} = useIntl()
    //const einstein = useEinstein()
    const {site, locale: multiSiteLocale} = useMultiSite()
    const [slowReqLoading, setSlowReqLoading] = useState(false)
    const [slowResult, setSlowResult] = useState(null)

    // DNT (Do Not Track)
    const {selectedDnt, effectiveDnt, updateDnt} = useDNT()
    const [dntLoading, setDntLoading] = useState(false)
    const handleSetDnt = async (value) => {
        setDntLoading(true)
        await updateDnt(value)
        setDntLoading(false)
    }

    // Parse query string
    const queryArg = useMemo(() => {
        const params = new URLSearchParams(search)
        return params.get('arg') || ''
    }, [search])

    // Simulate a slow request
    const handleSlowRequest = () => {
        setSlowReqLoading(true)
        setSlowResult(null)
        setTimeout(() => {
            setSlowResult('This is the result of a simulated slow request.')
            setSlowReqLoading(false)
        }, SLOW_REQUEST_DURATION)
    }

    // Search for products using commerce-sdk-react
    const {
        data: searchResult,
        isFetching: isSearchFetching,
        isError: isSearchError,
        error: searchError,
        refetch: refetchSearch
    } = useProductSearch(
        {
            parameters: {
                refine: [`cgid=${ROOT_CATEGORY_ID}`],
                limit: SEARCH_LIMIT,
                allImages: true,
                allVariationProperties: true,
                expand: ['prices', 'images', 'variations', 'custom_properties']
            }
        },
        {enabled: false} // Do not run automatically
    )

    // Handler to trigger expensive search (refetch wrapper in this case)
    const handleExpensiveSearch = () => refetchSearch()

    // Print some basic info
    const info = [
        {label: 'Pathname', value: pathname},
        {label: 'Query arg', value: queryArg || <em>(none)</em>},
        {label: 'Active locale', value: multiSiteLocale?.id || locale},
        {
            label: 'Active currency',
            value: multiSiteLocale?.preferredCurrency || site?.defaultCurrency || <em>(unknown)</em>
        },
        {label: 'Site ID', value: site?.id || <em>(none)</em>},
        {
            label: 'DNT Selected',
            value: typeof selectedDnt === 'boolean' ? selectedDnt.toString() : <em>(unset)</em>
        },
        {
            label: 'DNT Effective',
            value: typeof effectiveDnt === 'boolean' ? effectiveDnt.toString() : <em>(unset)</em>
        }
    ]

    return (
        <Box
            maxW="600px"
            mx="auto"
            mt={10}
            mb={10}
            p={6}
            borderWidth={1}
            borderRadius="lg"
            boxShadow="md"
        >
            <Heading as="h1" size="lg" mb={4}>
                Test & Debug Page
            </Heading>
            <Text mb={4} color="gray.600">
                This page is for debugging and development. The <Code>arg</Code> query string
                parameter will be echoed back on this page.
            </Text>
            <Stack spacing={2} mb={6}>
                {info.map((item, i) => (
                    <Box key={i} display="flex" justifyContent="space-between">
                        <Text fontWeight="bold">{item.label}:</Text>
                        <Text>{item.value}</Text>
                    </Box>
                ))}
            </Stack>
            <Box mb={4}>
                <Text fontWeight="bold" mb={2}>
                    DNT Controls:
                </Text>
                <Stack direction="row" spacing={3}>
                    <Button
                        onClick={() => handleSetDnt(true)}
                        isLoading={dntLoading}
                        colorScheme="green"
                    >
                        Set DNT: true
                    </Button>
                    <Button
                        onClick={() => handleSetDnt(false)}
                        isLoading={dntLoading}
                        colorScheme="red"
                    >
                        Set DNT: false
                    </Button>
                </Stack>
            </Box>
            <Box mb={4}>
                <Button
                    onClick={handleSlowRequest}
                    isLoading={slowReqLoading}
                    loadingText="Loading..."
                >
                    Simulate Slow Request
                </Button>
                <Box mt={3}>
                    {slowReqLoading && <Skeleton height="20px" width="100%" />}
                    {slowResult && <Text color="green.600">{slowResult}</Text>}
                </Box>
            </Box>
            <Box mb={4}>
                <Button
                    onClick={handleExpensiveSearch}
                    isLoading={isSearchFetching}
                    loadingText="Searching..."
                >
                    Run Root Category Search
                </Button>
                <Box mt={3}>
                    {isSearchFetching && <Skeleton height="40px" width="100%" />}
                    {isSearchError && (
                        <Text color="red.500">
                            Error: {searchError?.message || 'Unknown error'}
                        </Text>
                    )}
                    {!isSearchFetching && searchResult && (
                        <Box>
                            <Text fontWeight="bold" mb={2}>
                                Root Category Search Results ({searchResult.total || 0} found):
                            </Text>
                            <Stack spacing={1}>
                                {(searchResult.hits || []).map((hit) => (
                                    <Box
                                        key={hit.productId}
                                        p={2}
                                        borderWidth={1}
                                        borderRadius="md"
                                    >
                                        <Text fontWeight="bold">{hit.productName}</Text>
                                        <Text fontSize="sm" color="gray.500">
                                            ID: {hit.productId}
                                        </Text>
                                    </Box>
                                ))}
                            </Stack>
                        </Box>
                    )}
                </Box>
            </Box>
        </Box>
    )
}

export default TestPage
