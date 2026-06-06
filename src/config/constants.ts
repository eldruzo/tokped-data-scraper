// *************** IMPORT LIBRARIES ***************
import dotenv from 'dotenv';

/**
 * Load .env before any module-level code reads process.env.
 * Calling dotenv.config() here (rather than only in index.ts) ensures
 * env vars are available even when constants.ts is the first import resolved.
 */
dotenv.config();

// *************** API endpoints 
export const SEARCH_API_URL =
  'https://gql.tokopedia.com/graphql/SearchProductV5Query';
export const DESCRIPTION_API_URL =
  'https://gql.tokopedia.com/graphql/PDPMainInfo';

/**
 * Pagination
 * // rows=60  → items returned per page (Tokopedia's max for this endpoint)
 * page=N   → 1-based page number
 * start=N  → 0-based offset = (page - 1) * rows
 * Page 1: start=0,  returns items 0–59  (take all 60)
 * Page 2: start=60, returns items 60–119 (take first 40 to reach 100 total)
 */
export const PRODUCTS_PER_PAGE = 60;
export const TOTAL_PRODUCTS = 100;
export const TOTAL_PAGES = 2;

// *************** Delays / retries (env-overridable)
export const SEARCH_DELAY_MS = parseInt(
  process.env.SEARCH_DELAY_MS ?? '1000',
  10,
);
export const DESCRIPTION_DELAY_MS = parseInt(
  process.env.DESCRIPTION_DELAY_MS ?? '1500',
  10,
);
export const MAX_RETRIES = parseInt(process.env.MAX_RETRIES ?? '3', 10);

/**
 * Fixed 2 s back-off between retry attempts — long enough to clear transient
 * server errors without hammering the endpoint.
 */
export const RETRY_DELAY_MS = 2000;

// *************** Other constants
export const OUTPUT_FILE = 'products.csv';

/**
 * This function returns a set of HTTP headers that are used to mimic a real browser request when making API calls to Tokopedia. By including these headers, the script can help ensure that the requests are treated similarly to those from a real user browsing Tokopedia, which can help avoid issues with rate limiting or bot detection.
 * @returns 
 * Record<string, string> of HTTP headers to mimic a real browser request to Tokopedia's API.
 * These headers include:
 * - accept: '*' to accept all content types
 * - bd-device-id and bd-web-id: fixed values to identify the device and web session
 * - content-type: 'application/json' to indicate JSON payloads
 * - referer: 'https://www.tokopedia.com/' to indicate the request origin
 * - sec-ch-ua, sec-ch-ua-mobile, sec-ch-ua-platform: client hints to specify browser and platform details
 * - user-agent: a realistic user agent string for a desktop Chrome browser
 * - x-dark-mode, x-device, x-price-center, x-source, x-tkpd-lite-service, x-version: custom headers used by Tokopedia's API for various purposes (e.g., feature flags, versioning)
 * 
 * These headers help ensure that the requests sent by this script are treated similarly to those from a real user browsing Tokopedia, which can help avoid issues with rate limiting or bot detection.
 */
export function getHeaders(): Record<string, string> {
  return {
    accept: '*/*',
    'bd-device-id': '7648064484997105170',
    'content-type': 'application/json',
    referer: 'https://www.tokopedia.com/',
    'sec-ch-ua':
      '"Chromium";v="148", "Google Chrome";v="148", "Not/A)Brand";v="99"',
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform': '"Windows"',
    'user-agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36',
    'x-date': new Date().toUTCString().replace('GMT', '+0700'),
    'x-device': 'desktop',
    'x-price-center': 'true',
    'x-source': 'tokopedia-lite',
    'x-tkpd-akamai': 'pdpMainInfo',
    'x-tkpd-lite-service': 'zeus',
    'x-tkpd-pdpb': '0',
    'x-version': '2a71be3',
  };
}
