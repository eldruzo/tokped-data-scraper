// *************** IMPORT LIBRARIES ***************
import axios from 'axios';
import { DESCRIPTION_API_URL, getHeaders } from '../config/constants';
import { withRetry } from '../utils/retry';

// **************** GraphQL query for fetching product descriptions ***************
const DESCRIPTION_QUERY =
  'query PDPMainInfo($productKey: String, $shopDomain: String, $layoutID: String, $extraPayload: String, $queryParam: String, $source: String, $userLocation: pdpUserLocation) { pdpMainInfo(shopDomain: $shopDomain, productKey: $productKey, layoutID: $layoutID, extraPayload: $extraPayload, queryParam: $queryParam, source: $source, userLocation: $userLocation) { components { name type data { ... on pdpDataProductDetail { title productDetailDescription { title content } } } } } }';

  /**
   * Parses a Tokopedia product URL to extract the shop domain and product key.
   * Tokopedia product URLs follow the pattern:
   * https://www.tokopedia.com/{shopDomain}/{productKey}[?optional-query]
   * Example:
   * https://www.tokopedia.com/grand-elektro-886/vivo-y20s-ram-8-256gb-...
   *  → shopDomain = "grand-elektro-886"
   *  → productKey = "vivo-y20s-ram-8-256gb-..."
   * 
   * The PDP (Product Detail Page) GraphQL endpoint requires both values to
   * identify the product — neither the numeric product ID nor the full URL alone
   * is accepted by this particular query.
   */
function parseProductUrl(url: string): { shopDomain: string; productKey: string } {
  try {
    const parsed = new URL(url);
    const segments = parsed.pathname.split('/').filter(Boolean);
    return {
      shopDomain: segments[0] ?? '',
      productKey: segments[1] ?? '',
    };
  } catch {
    return { shopDomain: '', productKey: '' };
  }
}

/**
 * Strip markdown-style formatting that appears in raw Tokopedia descriptions,
 * and collapse whitespace to produce a cleaner plain-text description. Also
 * @param raw 
 * @returns 
 * The cleaning steps include:
 * - Removing markdown bold markers (*) and header markers (#)
 * - Collapsing multiple consecutive newlines into a single space
 * - Replacing remaining newlines with spaces
 * - Collapsing multiple consecutive spaces into a single space
 * - Trimming leading and trailing whitespace
 * - Truncating the description to a maximum of 500 characters to ensure it fits within the desired length constraints for the output.
 * 
 * These steps help ensure that the final description is clean, readable, and concise, making it suitable for inclusion in the output CSV file without unnecessary formatting or excessive length. 
 */
function cleanDescription(raw: string): string {
  return raw
    .replace(/[*#]/g, '') // markdown bold (*text*) and headers (#)
    .replace(/\n{2,}/g, ' ') // collapse blank lines
    .replace(/\n/g, ' ') // remaining newlines → space
    .replace(/\s{2,}/g, ' ') // collapse runs of spaces
    .trim()
    .substring(0, 500);
}

/**
 * function to fetch product description from Tokopedia's PDPMainInfo GraphQL endpoint using the product URL to extract necessary parameters. The function handles potential errors gracefully by returning an empty string if the description cannot be fetched for any reason (e.g., invalid URL, network issues, unexpected response structure). It uses a retry mechanism to handle transient errors when making the API call, and it processes the response to extract and clean the product description before returning it.
 * @param productUrl 
 * @returns 
 * The function performs the following steps:
 * 1. Parses the product URL to extract the shop domain and product key using the `parseProductUrl` helper function. If either value is missing, it returns an empty string.
 * 2. Constructs the GraphQL query payload with the extracted parameters and other required fields.
 * 3. Makes a POST request to the DESCRIPTION_API_URL endpoint with the payload and appropriate headers, using the `withRetry` function to handle transient errors.
 * 4. Processes the response to find the component named "product_detail" that contains the product description data.
 * 5. Extracts the raw description content from the response, handling cases where the description may be a single object or an array of objects.
 * 6. Cleans the raw description using the `cleanDescription` helper function to remove markdown formatting and excess whitespace, and truncates it to a maximum of 500 characters.
 * 7. Returns the cleaned description, or an empty string if any step fails or if
 */
export async function fetchDescription(productUrl: string): Promise<string> {
  // *************** Parse the product URL to extract the shop domain and product key, which are required parameters for the PDPMainInfo GraphQL query. If either value is missing or if the URL is invalid, the function returns an empty string, indicating that the description cannot be fetched for this product.
  const { shopDomain, productKey } = parseProductUrl(productUrl);
  if (!shopDomain || !productKey) return '';

  // *************** Construct the GraphQL query payload with the extracted parameters and other required fields. This payload is sent in the POST request to the DESCRIPTION_API_URL endpoint to retrieve the product's detailed information, including the description.
  const payload = [
    {
      operationName: 'PDPMainInfo',
      variables: {
        productKey,
        shopDomain,
        layoutID: '',
        extraPayload: '',
        queryParam: '',
        source: 'P1',
        userLocation: {
          addressID: '',
          districtID: '2274',
          postalCode: '',
          latlon: '',
          cityID: '176',
        },
      },
      query: DESCRIPTION_QUERY,
    },
  ];

  // *************** Make a POST request to the DESCRIPTION_API_URL endpoint with the payload and appropriate headers, using the withRetry function to handle transient errors. The response is expected to contain the product's detailed information, including the description, which will be processed in the subsequent steps. If the request fails after the specified number of retries, an error will be thrown and caught by the caller, resulting in an empty description for that product.
  const response = await withRetry(() =>
    axios.post(DESCRIPTION_API_URL, payload, { headers: getHeaders() }),
  );

  /**
   * Traversal path:
   *   response[0].data.pdpMainInfo.components  ← array of UI components
   *   Find the component named "product_detail" ← holds the long description
   *   .data[0].productDetailDescription         ← array of { title, content }
   *   Concatenate all .content values
   */
  const components: Array<{ name: string; data: unknown[] }> =
    response.data?.[0]?.data?.pdpMainInfo?.components ?? [];

  // *************** Find the "product_detail" component that contains the description data, and return "" if not found or if the expected structure is missing 
  const detailComponent = components.find((c) => c.name === 'product_detail');
  if (!detailComponent) return '';

  // *************** Extract the raw description content, handling cases where the description may be a single object or an array of objects, and return "" if the expected structure is missing 
  type DescItem = { title?: string; content: string };
  type DataItem = { 
    title?: string;
    productDetailDescription?: DescItem[] | DescItem;
    content?: Array<{ title?: string; subtitle?: string }>;
  };
  const dataItem = detailComponent.data?.[0] as DataItem | undefined;
  if (!dataItem?.productDetailDescription) return '';

  // *************** productDetailDescription can be a single object or an array — handle both defensively
  const desc = dataItem.productDetailDescription;

  // *************** Extract content: if array, concatenate all content values; if single object, take its content
  const rawContent = Array.isArray(desc)
    ? desc.map((d) => d.content ?? '').join('\n')
    : (desc as DescItem).content ?? '';

  // *************** Clean the raw description to remove markdown formatting and excess whitespace, and truncate it to a maximum of 500 characters. Return the cleaned description, or "" if the raw content is missing or empty
  return rawContent ? cleanDescription(rawContent) : '';
}
