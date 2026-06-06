// *************** IMPORT LiBRARIES ***************
import axios from 'axios';
import { SEARCH_API_URL, PRODUCTS_PER_PAGE, getHeaders } from '../config/constants';
import { RawProduct } from '../model/product';
import { withRetry } from '../utils/retry';

/**
 * Why axios instead of Playwright:
 * Network inspection in DevTools revealed that the search results page calls a
 * plain JSON GraphQL endpoint. There is no server-side rendering challenge or
 * JavaScript-gated content — the API returns data directly. Axios is faster
 * (~50 ms vs ~3 s browser startup), uses far less memory, and has no external
 * Chrome/Chromium dependency.
*/
const SEARCH_QUERY = `query SearchProductV5Query($params: String!) {
  searchProductV5(params: $params) {
    header {
      totalData
      responseCode
      additionalParams
      __typename
    }
    data {
      products {
        oldID: id
        id: id_str_auto_
        name
        url
        mediaURL {
          image
          __typename
        }
        shop {
          oldID: id
          id: id_str_auto_
          name
          city
          tier
          __typename
        }
        price {
          text
          number
          __typename
        }
        rating
        __typename
      }
      __typename
    }
    __typename
  }
}`;

/**
 * This function fetches a page of products from Tokopedia's search API using the provided page number to construct the appropriate query parameters for pagination. It handles the necessary pagination metadata returned by the API to ensure that subsequent page requests are correctly linked together in a search session. The function uses axios to make a POST request to the GraphQL endpoint and includes retry logic to handle transient errors. It returns an array of RawProduct objects representing the products returned by the API for the requested page.
 * @param page 
 * @returns 
 * The function performs the following steps:
 * 1. Constructs the GraphQL query payload with the appropriate parameters for the requested page, including pagination metadata for page 2 and beyond.
 * 2. Makes a POST request to the SEARCH_API_URL endpoint with the payload and appropriate headers, using the `withRetry` function to handle transient errors.
 * 3. Logs the full response data for debugging purposes.
 * 4. Extracts the array of products from the response, handling cases where the expected structure may be missing.
 * 5. Extracts pagination metadata from the response header for use in subsequent page requests, converting it from a URL-encoded query string into a structured object and updating the global paginationMetadata variable.
 * 6. Logs a warning if the API returns zero products for the requested page, which may indicate stale API headers or other issues.
 * 7. Returns an array of RawProduct objects representing the products returned
 */
interface PaginationMetadata {
  searchId: string;
  hasMore: boolean;
  nextOffsetOrganic: number;
  nextOffsetOrganicAd: number;
}

/**
 * Static device fingerprint — consistent across pagination
 * In a real browser, Tokopedia's frontend generates this on page load
 */
const UNIQUE_ID = '47e12cbbad94549709b7a6597b493548';

// *************** Global variable to store pagination metadata across page requests. This includes the searchId generated on the first page load, as well as hasMore, nextOffsetOrganic, and nextOffsetOrganicAd values returned by the API for subsequent pages. The fetchProductPage function updates this variable after each API call to ensure that the correct parameters are included in the next page request.
let paginationMetadata: PaginationMetadata | null = null;

/**
 * Generate search_id on first page load
 * Format: YYYYMMDDHHmmss + random hex (matches Tokopedia's pattern)
*/ 
function generateSearchId(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const date = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  const timestamp = `${year}${month}${date}${hours}${minutes}${seconds}`;
  
  // *************** Random hex suffix (12 chars + 'V' suffix)
  const randomHex = Math.random().toString(16).substring(2, 14).toUpperCase().padEnd(12, '0');
  return `${timestamp}${randomHex}V`;
}

/**
 * Pagination params explained:
 *   rows=60  → how many items the API should return this page
 *   page=N   → 1-based page counter (used by Tokopedia for analytics/caching)
 *   start=N  → 0-based item offset = (page - 1) * rows
 *
 * For page 2+, we must also include search_id, has_more, next_offset_organic, 
 * and next_offset_organic_ad from the previous response. These tie all pages
 * in a search session together.
*/
function buildParams(page: number): string {
  // *************** Calculate the start offset based on the page number and products per page constant. This determines how many items to skip in the search results for pagination. For example, page 1 starts at offset 0, page 2 starts at offset 60, etc.
  const start = (page - 1) * PRODUCTS_PER_PAGE;
  
  // *************** Page 1: generate search_id and use minimal params
  if (page === 1) {
    // *************** Generate a unique searchId for the first page load, which is required by the API to identify the search session. This value is stored in the paginationMetadata variable for use in subsequent page requests to ensure that all pages are linked together in the same search session. The searchId is a combination of a timestamp and a random hex string, mimicking the pattern observed in Tokopedia's frontend.
    const searchId = generateSearchId();
    // *************** Store it for page 2+
    if (!paginationMetadata) {
      paginationMetadata = {
        searchId,
        hasMore: true,
        nextOffsetOrganic: PRODUCTS_PER_PAGE,
        nextOffsetOrganicAd: PRODUCTS_PER_PAGE,
      };
    }

    // *************** Construct the query parameters for the first page request, which includes the generated searchId and other required parameters for the API call. Subsequent pages will include additional pagination metadata returned by the API.
    return (
      `device=desktop&enter_method=normal_search&l_name=sre` +
      `&navsource=category&ob=23&page=${page}` +
      `&q=handphone&related=true&rows=${PRODUCTS_PER_PAGE}` +
      `&safe_search=false&sc=&scheme=https&shipping=&show_adult=false` +
      `&source=search&st=product&start=${start}&topads_bucket=true` +
      `&unique_id=${UNIQUE_ID}&user_addressId=&user_cityId=176&user_districtId=2274&user_id=` +
      `&user_lat=&user_long=&user_postCode=&user_warehouseId=&variants=&warehouses=`
    );
  }

  // *************** Page 2+: include pagination metadata
  if (!paginationMetadata) {
    // *************** Log an error if pagination metadata is missing for a subsequent page request
    console.error('Pagination metadata missing for page', page);
    return '';
  }

  return (
    `device=desktop&enter_method=normal_search&has_more=${paginationMetadata.hasMore}` +
    `&l_name=sre&navsource=category&next_offset_organic=${paginationMetadata.nextOffsetOrganic}` +
    `&next_offset_organic_ad=${paginationMetadata.nextOffsetOrganicAd}&ob=23&page=${page}` +
    `&q=handphone&related=true&rows=${PRODUCTS_PER_PAGE}` +
    `&safe_search=false&sc=&scheme=https&search_id=${paginationMetadata.searchId}` +
    `&shipping=&show_adult=false&source=search&st=product&start=${start}&topads_bucket=true` +
    `&unique_id=${UNIQUE_ID}&user_addressId=&user_cityId=176&user_districtId=2274&user_id=` +
    `&user_lat=&user_long=&user_postCode=&user_warehouseId=&variants=&warehouses=`
  );
}

/**
 * fetchProductPage is an asynchronous function that retrieves a page of products from Tokopedia's search API based on the provided page number. It constructs the necessary query parameters for pagination, makes a POST request to the API endpoint, and processes the response to extract product data and pagination metadata. The function includes error handling with retry logic to ensure reliable data fetching, and it returns an array of RawProduct objects representing the products returned by the API for the requested page.
 * @param page 
 * @returns 
 * The function performs the following steps:
 * 1. Constructs the GraphQL query payload with the appropriate parameters for the requested page, including pagination metadata for page 2 and beyond.
 * 2. Makes a POST request to the SEARCH_API_URL endpoint with the payload and appropriate headers, using the `withRetry` function to handle transient errors.
 * 3. Logs the full response data for debugging purposes.
 * 4. Extracts the array of products from the response, handling cases where the expected structure may be missing.
 * 5. Extracts pagination metadata from the response header for use in subsequent page requests, converting it from a URL-encoded query string into a structured object and updating the global paginationMetadata variable.
 * 6. Logs a warning if the API returns zero products for the requested page, which may indicate stale API headers or other issues.
 * 7. Returns an array of RawProduct objects representing the products returned by the API for the requested page, or an empty array if the expected structure is
 */
export async function fetchProductPage(page: number): Promise<RawProduct[]> {
  // *************** Construct the GraphQL query payload with the appropriate parameters for the requested page, including pagination metadata for page 2 and beyond. The buildParams function generates the query parameters based on the page number and the current pagination metadata stored in the global variable.
  const payload = [
    {
      operationName: 'SearchProductV5Query',
      variables: { params: buildParams(page) },
      query: SEARCH_QUERY,
    },
  ];

  // *************** Make a POST request to the search API endpoint with the constructed payload and appropriate headers, using the withRetry function to handle transient errors and ensure reliable data fetching. The response is expected to contain the search results for the requested page, which will be processed in subsequent steps to extract product information and pagination metadata.
  const response = await withRetry(() =>
    axios.post(SEARCH_API_URL, payload, { headers: getHeaders() }),
  );

  // *************** Get the array of products from the response, handling cases where the expected structure may be missing. The API response is expected to have a nested structure where the products are located at response.data[0].data.searchProductV5.data.products. If any part of this path is missing or undefined, an empty array is returned to ensure that the function always returns an array of RawProduct objects, even if the API response does not contain the expected data.
  const products: RawProduct[] =
    response.data?.[0]?.data?.searchProductV5?.data?.products ?? [];

  // *************** Extract pagination metadata from header for next page request
  const additionalParamsRaw = response.data?.[0]?.data?.searchProductV5?.header?.additionalParams;
  if (additionalParamsRaw && paginationMetadata) {
    let additionalParams: Record<string, any> = {};
    
    // *************** additionalParams is a URL-encoded query string, not JSON
    if (typeof additionalParamsRaw === 'string') {
      const params = new URLSearchParams(additionalParamsRaw);
      for (const [key, value] of params.entries()) {
        // *************** Convert numeric values
        if (value === 'true') additionalParams[key] = true;
        else if (value === 'false') additionalParams[key] = false;
        else if (!isNaN(Number(value))) additionalParams[key] = Number(value);
        else additionalParams[key] = value;
      }
    } else {
      additionalParams = additionalParamsRaw;
    }

    // *************** Update metadata for next page (keep searchId from first page)
    paginationMetadata.hasMore = additionalParams.has_more ?? true;
    paginationMetadata.nextOffsetOrganic = additionalParams.next_offset_organic ?? PRODUCTS_PER_PAGE * page;
    paginationMetadata.nextOffsetOrganicAd = additionalParams.next_offset_organic_ad ?? PRODUCTS_PER_PAGE * page;

    console.log('Updated pagination metadata:', paginationMetadata);
  }

  // *************** Log a warning if the API returns zero products for the requested page, which may indicate stale API headers or other issues.
  if (products.length === 0) {
    console.warn(
      `  Warning: page ${page} returned 0 products. ` +
        'The API headers may be stale — re-capture them from DevTools.',
    );
  }

  // *************** Return the array of products for this page, or an empty array if the expected structure is missing in the response. Each product is typed as a RawProduct object, which includes fields such as name, url, mediaURL, shop, price, and rating as returned by the API before any processing or transformation.
  return products;
}
