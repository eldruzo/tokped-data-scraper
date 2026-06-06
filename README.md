# tokopedia-scraper-node

A TypeScript/Node.js utility that scrapes 100 handphone products from Tokopedia and writes them to a CSV file. Built for the Brick fintech backend engineer assessment.

---

## Table of Contents

1. [Prerequisites & Installation](#1-prerequisites--installation)
2. [Configuring .env](#2-configuring-env)
3. [Build & Run](#3-build--run)
4. [Library Choices & Rationale](#4-library-choices--rationale)
5. [How Pagination Works](#5-how-pagination-works)
6. [The Description Field](#6-the-description-field)
7. [Known Limitations](#7-known-limitations)
8. [Interview Preparation](#8-interview-preparation)

---

## 1. Prerequisites & Installation

**Requirements:**
- Node.js 18+ (check: `node -v`)
- npm 9+ (check: `npm -v`)

**Install:**

```bash
npm install
```

**Copy the env template:**

```bash
cp .env.example .env
```

No cookies or credentials required — the scraper uses static browser-identity headers that work without a logged-in session.

---

## 2. Configuring .env

All settings are optional. The defaults work out of the box.

```env
# Set to true to fetch a description for every product (~2.5 min extra)
FETCH_DESCRIPTIONS=false

# Delay between page requests (ms) — default 1000
SEARCH_DELAY_MS=1000

# Delay between description requests (ms) — default 1500
DESCRIPTION_DELAY_MS=1500

# Max retry attempts on network/5xx errors — default 3
MAX_RETRIES=3
```

---

## 3. Build & Run

**Run directly with ts-node (recommended for development):**

```bash
npm start
```

**Compile to JavaScript first, then run:**

```bash
npm run build
npm run start:prod
```

**Output:** `products.csv` is written to the project root.

**Sample console output:**

```
=== Tokopedia Handphone Scraper ===
Fetch descriptions : false
Output file        : products.csv

Fetching page 1/2...
  Got 60 products on this page (running total: 60)
Fetching page 2/2...
  Got 40 products on this page (running total: 100)

Search phase complete. Total products: 100

Note: Descriptions skipped (FETCH_DESCRIPTIONS=false).
      Set FETCH_DESCRIPTIONS=true in .env to enable.
      Each product requires one extra API call → adds ~2.5 min total.

Writing 100 rows to products.csv...
Done. Open products.csv to view results.
```

---

## 4. Library Choices & Rationale

| Library | Purpose | Why this one |
|---|---|---|
| **axios** | HTTP requests to Tokopedia's GraphQL API | Mature promise-based client with built-in JSON handling, clear `AxiosError` type for status-code inspection, and no DOM renderer needed since we call the API directly. |
| **csv-writer** | Writes the products array to a `.csv` file | Simple `createObjectCsvWriter` API that maps TypeScript object keys to CSV columns — no manual string escaping. Ships its own TypeScript declarations. |
| **dotenv** | Loads `.env` into `process.env` | Zero-dependency, single-function setup. Keeps runtime config out of source code. |
| **typescript + ts-node** | Type-safe development without a separate compile step | TypeScript catches shape mismatches between the API response and the `Product` interface at edit time. `ts-node` runs `.ts` files directly so iteration is fast. |

---

## 5. How Pagination Works

Tokopedia's search API uses three parameters together:

| Parameter | Meaning | Page 1 | Page 2 |
|---|---|---|---|
| `rows` | How many items to return per request | 60 | 60 |
| `page` | 1-based page number (Tokopedia analytics) | 1 | 2 |
| `start` | 0-based item offset `= (page-1) * rows` | 0 | 60 |

Think of it like a book index:

- **Page 1** says "start at item 0, give me 60 items" → you get items 1–60.
- **Page 2** says "start at item 60, give me 60 items" → you get items 61–120.
  We only keep the first 40 of those (items 61–100), so the total is exactly 100.

All three parameters must be consistent. If `page` and `start` disagree, the API may return duplicates or skip items.

---

## 6. The Description Field

### What it is

Each product on Tokopedia has a long-form description written by the seller — things like specifications, warranty info, and usage notes. This lives on the product detail page, not on the search results page.

### Why it needs a separate API call

The search endpoint (`SearchProductV5Query`) only returns list-view data: name, price, image, rating. The description is loaded lazily by the browser when a user opens a product page. To get it we must call the Product Detail Page GraphQL endpoint (`PDPMainInfo`) for each product individually.

### How to enable it

Set `FETCH_DESCRIPTIONS=true` in `.env`. The scraper will then call `PDPMainInfo` once per product, waiting 1.5 seconds between calls to avoid triggering rate limits.

### What the scraper extracts

From the `PDPMainInfo` response it:
1. Finds the component named `"product_detail"` in the `components` array
2. Reads `productDetailDescription[*].content`
3. Strips markdown (`*`, `#`), collapses newlines into spaces, and truncates to 500 characters

If the component is absent or the content is empty, description is written as `""`.

---

## 7. Known Limitations

**Rate limiting.**
Fetching descriptions fires 100 extra API requests. The 1.5-second delay is a conservative "polite" interval. If you encounter empty results or errors mid-run, increase `DESCRIPTION_DELAY_MS` to 3000 or more.

**Description fetch time.**
100 products × (1 API call + 1.5 s delay) ≈ **2.5 minutes** of additional run time. The base search-only run takes under 5 seconds.

**Search results are not static.**
Tokopedia's ranking changes continuously. Running the scraper at different times will produce different product sets. The `ob=23` parameter requests a specific sort order (relevance/popularity), but sponsored/promoted products still appear.

**Headers may need updating over time.**
The static headers (including `x-version`, `bd-device-id`, `bd-web-id`) were captured from a real browser session. If Tokopedia rotates these identifiers or changes the required header set, re-capture them from DevTools by watching a `SearchProductV5Query` request in the Network tab.

**This is not a production system.**
There is no persistent storage, deduplication, or incremental sync. It is a single-run assessment tool.

---

## 8. Interview Preparation

### Plain-English Explanation of the Approach

"I opened the Tokopedia search page in Chrome, then opened DevTools and watched the Network tab while the page loaded. I saw that the browser was making a POST request to `gql.tokopedia.com` — a GraphQL API — and getting back structured JSON with exactly the product data I needed. I copied the request headers from that call (user-agent, device IDs, content-type, etc.) and replicated the same HTTP request directly in Node.js using axios. The API gives me the data immediately, no HTML parsing or headless browser required."

### Why Direct API Calls Beat a Headless Browser

| Factor | Headless browser (Playwright/Puppeteer) | Direct API (axios) |
|---|---|---|
| Startup time | 3–5 s per run (Chrome launch) | ~50 ms |
| Memory | 200–500 MB | ~30 MB |
| Reliability | Breaks when the page layout changes | Breaks only when the API schema changes |
| Speed | Sequential page loads | Parallel-capable requests |
| Complexity | Needs selector maintenance | Needs only header/payload maintenance |

The only time you need a headless browser is when the data is rendered client-side *without* a discoverable API — for example, a canvas element or a heavily obfuscated frontend.

### Explaining Pagination to a Non-Technical Interviewer

"Imagine a database of 10,000 phones. Asking for all 10,000 at once would be slow and wasteful. Instead, the API works like pages in a book — you ask for page 1 (items 1–60), then page 2 (items 61–120), and so on. Each request includes a page number and a starting position so the server knows exactly which slice to return. We only needed 100 products, so we asked for page 1 (all 60) and the first 40 items from page 2."

### Addressing the Description Limitation Honestly

"The description field is genuinely optional in this design — and intentionally so. Fetching it adds 100 extra network requests, which takes about 2.5 minutes and increases the risk of hitting the API's rate limit. For an assessment that only requires 100 products, shipping a reliable fast-path first and making descriptions opt-in was the pragmatic trade-off. In a production system I would pre-fetch descriptions in parallel batches or store them in a queue for async processing."

### What "Polite Scraping" Means and Why It Matters

Polite scraping means behaving like a considerate user rather than a flood of automated traffic:
- **Delays between requests** (1 s for search pages, 1.5 s for descriptions) so the server isn't overwhelmed
- **Retrying gracefully** with back-off rather than hammering on failures
- **Stopping on 4xx errors** rather than retrying indefinitely when the server signals a client problem
- **Sending realistic headers** so the server can classify the traffic correctly

It matters both ethically (you're using a shared resource) and practically (aggressive scrapers get IP-banned quickly).

### Likely Interview Questions & Honest Answers

**Q: How did you discover these API endpoints?**
A: Browser DevTools. I opened the Network tab, filtered by `Fetch/XHR`, navigated the Tokopedia search page, and watched which requests fired. The `SearchProductV5Query` and `PDPMainInfo` requests were immediately visible with their full payloads. I copied the headers and body from DevTools and translated them directly into axios calls.

**Q: What happens if Tokopedia changes the required headers?**
A: The scraper would start returning empty results or errors. The fix is to re-capture the headers from a fresh DevTools session — the `x-version` field in particular looks like a build hash that could change on deploys. A more robust long-term solution would be to automate the header capture step using Playwright just for that purpose, then pass the headers to axios.

**Q: How would you scale this to 10,000 products?**
A: Introduce concurrency with a worker pool (e.g. `p-limit`) for description fetches, add a persistent store (Redis/Postgres) to checkpoint progress, and implement exponential backoff for rate-limit errors (429). The search phase would need to page through all 167 pages (10,000 / 60).

**Q: How do you know the API schema won't change?**
A: I don't. GraphQL schemas can change without notice since the API is private/undocumented. The right mitigation is runtime validation (e.g. with `zod`) so the scraper fails fast with a clear error message if the response shape changes, rather than silently producing empty data.

**Q: What would you improve with more time?**

1. **`zod` schema validation** on every API response — fail fast with a useful error instead of returning silent empty strings
2. **Concurrent description fetching** with a rate-limited pool (e.g. 5 parallel requests, 500 ms apart) to reduce the 2.5-minute overhead to ~30 seconds
3. **Incremental / resumable runs** — write a checkpoint file so a failed run at product 80 can resume from product 81
4. **Unit tests** for `parseProductUrl`, `cleanDescription`, and `buildParams` — these pure functions are easy to test and most likely to break on edge-case input
5. **Automated header refresh** using Playwright headlessly just to capture fresh headers, then passing them to axios — removes the only manual step remaining
