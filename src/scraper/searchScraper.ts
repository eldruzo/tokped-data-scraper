import axios from 'axios';
import { SEARCH_API_URL, PRODUCTS_PER_PAGE, getHeaders } from '../config/constants';
import { RawProduct } from '../model/product';
import { withRetry } from '../utils/retry';

// Why axios instead of Playwright:
// Network inspection in DevTools revealed that the search results page calls a
// plain JSON GraphQL endpoint. There is no server-side rendering challenge or
// JavaScript-gated content — the API returns data directly. Axios is faster
// (~50 ms vs ~3 s browser startup), uses far less memory, and has no external
// Chrome/Chromium dependency.
const SEARCH_QUERY =
  'query SearchProductV5Query($params: String!) { searchProductV5(params: $params) { data { products { id: id_str_auto_ name url mediaURL { image } shop { name } price { text number } rating } } } }';

// Pagination params explained:
//   rows=60  → how many items the API should return this page
//   page=N   → 1-based page counter (used by Tokopedia for analytics/caching)
//   start=N  → 0-based item offset = (page - 1) * rows
//
// The three parameters must be consistent or the API returns duplicates/gaps.
// Page 1 → start=0 (items 0–59)
// Page 2 → start=60 (items 60–119; we slice off the last 20 to reach 100 total)
function buildParams(page: number): string {
  const start = (page - 1) * PRODUCTS_PER_PAGE;
  return (
    `device=desktop&navsource=category&ob=23&page=${page}` +
    `&q=handphone&related=true&rows=${PRODUCTS_PER_PAGE}` +
    `&safe_search=false&source=search&st=product&start=${start}&topads_bucket=true`
  );
}

export async function fetchProductPage(page: number): Promise<RawProduct[]> {
  const payload = [
    {
      operationName: 'SearchProductV5Query',
      variables: { params: buildParams(page) },
      query: SEARCH_QUERY,
    },
  ];

  const response = await withRetry(() =>
    axios.post(SEARCH_API_URL, payload, { headers: getHeaders() }),
  );

  console.log(JSON.stringify(response.data, null, 2)); // Log full response for debugging

  const products: RawProduct[] =
    response.data?.[0]?.data?.searchProductV5?.data?.products ?? [];

  if (products.length === 0) {
    console.warn(
      `  Warning: page ${page} returned 0 products. ` +
        'The API headers may be stale — re-capture them from DevTools.',
    );
  }

  return products;
}
