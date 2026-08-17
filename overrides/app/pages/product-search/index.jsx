import React from 'react'
import {
    Box,
    Heading,
    Text,
    SimpleGrid,
    Image,
    Skeleton,
    Spinner
} from '@salesforce/retail-react-app/app/components/shared/ui'
import {useProductSearch} from '@salesforce/commerce-sdk-react'
import {useLocation} from 'react-router-dom'

// How many products to show when no limit is specified in the query string
const DEFAULT_LIMIT = 12

const ProductSearchPage = () => {
    const location = useLocation()
    const params = new URLSearchParams(location.search)
    const q = params.get('q') || 'shirt'
    const limit = Number(params.get('limit')) || DEFAULT_LIMIT

    const {
        data: searchResult,
        isLoading: loading,
        isError,
        error
    } = useProductSearch({
        parameters: {
            q,
            limit,
            allImages: true,
            allVariationProperties: true,
            expand: ['prices', 'images', 'variations', 'custom_properties']
        }
    })
    const products = searchResult?.hits || []
    const resultCount = searchResult?.hits?.length || 0
    const searchTotal = searchResult?.total || 0

    return (
        <Box
            maxW="900px"
            mx="auto"
            mt={10}
            mb={10}
            p={6}
            borderWidth={1}
            borderRadius="lg"
            boxShadow="md"
        >
            <Heading as="h1" size="lg" mb={2}>
                Product Search
            </Heading>
            <Text mb={4} color="gray.600">
                Showing <b>{resultCount}</b> of {searchTotal} results for &quot;<b>{q}</b>&quot;
            </Text>
            {isError && (
                <Text color="red.500">Error: {error?.message || 'Failed to fetch products.'}</Text>
            )}
            <SimpleGrid columns={{base: 1, sm: 2, md: 3}} spacing={6}>
                {loading && Array(resultCount).map((_, i) => <Skeleton key={i} height="200px" />)}
                {!loading && products.length === 0 && !isError && <Text>No products found.</Text>}
                {products.map((product) => (
                    <Box
                        key={product.productId}
                        borderWidth={1}
                        borderRadius="md"
                        p={4}
                        boxShadow="sm"
                    >
                        <Image
                            src={product.image?.disBaseLink}
                            alt={product.productName}
                            fallback={
                                <Box display="flex" alignItems="center" justifyContent="center">
                                    <Spinner thickness="3px" size="xl" />
                                </Box>
                            }
                            mb={2}
                            borderRadius="md"
                        />
                        <Text fontWeight="bold">{product.productName}</Text>
                        <Text fontSize="sm" color="gray.500">
                            ID: {product.productId}
                        </Text>
                        {product.price && (
                            <Text color="green.600" fontWeight="bold">
                                ${product.price}
                            </Text>
                        )}
                    </Box>
                ))}
            </SimpleGrid>
        </Box>
    )
}

export default ProductSearchPage
