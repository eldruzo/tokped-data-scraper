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
