import axios from 'axios';
import { DESCRIPTION_API_URL, getHeaders } from '../config/constants';
import { withRetry } from '../utils/retry';

const DESCRIPTION_QUERY =
  'query PDPMainInfo($productKey: String, $shopDomain: String, $layoutID: String, $extraPayload: String, $queryParam: String, $source: String, $userLocation: pdpUserLocation) { pdpMainInfo(shopDomain: $shopDomain, productKey: $productKey, layoutID: $layoutID, extraPayload: $extraPayload, queryParam: $queryParam, source: $source, userLocation: $userLocation) { components { name type data { ... on pdpDataProductDetail { title productDetailDescription { title content } } } } } }';

// Tokopedia product URLs follow the pattern:
//   https://www.tokopedia.com/{shopDomain}/{productKey}[?optional-query]
//
// Example:
//   https://www.tokopedia.com/grand-elektro-886/vivo-y20s-ram-8-256gb-...
//   → shopDomain = "grand-elektro-886"
//   → productKey = "vivo-y20s-ram-8-256gb-..."
//
// The PDP (Product Detail Page) GraphQL endpoint requires both values to
// identify the product — neither the numeric product ID nor the full URL alone
// is accepted by this particular query.
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

// Strip markdown-style formatting that appears in raw Tokopedia descriptions,
// then normalise whitespace and truncate for CSV readability.
function cleanDescription(raw: string): string {
  return raw
    .replace(/[*#]/g, '') // markdown bold (*text*) and headers (#)
    .replace(/\n{2,}/g, ' ') // collapse blank lines
    .replace(/\n/g, ' ') // remaining newlines → space
    .replace(/\s{2,}/g, ' ') // collapse runs of spaces
    .trim()
    .substring(0, 500);
}

export async function fetchDescription(productUrl: string): Promise<string> {
  const { shopDomain, productKey } = parseProductUrl(productUrl);
  if (!shopDomain || !productKey) return '';

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

  const response = await withRetry(() =>
    axios.post(DESCRIPTION_API_URL, payload, { headers: getHeaders() }),
  );

  // Traversal path:
  //   response[0].data.pdpMainInfo.components  ← array of UI components
  //   Find the component named "product_detail" ← holds the long description
  //   .data[0].productDetailDescription         ← array of { title, content }
  //   Concatenate all .content values
  const components: Array<{ name: string; data: unknown[] }> =
    response.data?.[0]?.data?.pdpMainInfo?.components ?? [];

  const detailComponent = components.find((c) => c.name === 'product_detail');
  if (!detailComponent) return '';

  type DescItem = { title: string; content: string };
  type DataItem = { productDetailDescription?: DescItem[] | DescItem };
  const dataItem = detailComponent.data?.[0] as DataItem | undefined;
  if (!dataItem?.productDetailDescription) return '';

  const desc = dataItem.productDetailDescription;

  // productDetailDescription is typed as a list in the schema but occasionally
  // arrives as a single object — handle both defensively.
  const rawContent = Array.isArray(desc)
    ? desc.map((d) => d.content ?? '').join(' ')
    : (desc as DescItem).content ?? '';

  return rawContent ? cleanDescription(rawContent) : '';
}
