// dotenv is loaded inside constants.ts at module-init time, so all process.env
// reads below are already populated when this file's body executes.
import {
  TOTAL_PRODUCTS,
  TOTAL_PAGES,
  SEARCH_DELAY_MS,
  DESCRIPTION_DELAY_MS,
  OUTPUT_FILE,
} from './config/constants';
import { fetchProductPage } from './scraper/searchScraper';
import { fetchDescription } from './scraper/descriptionScraper';
import { writeToCSV } from './writer/csvWriter';
import { Product, RawProduct } from './model/product';
import { sleep } from './utils/retry';

async function main(): Promise<void> {
  const fetchDescriptions = process.env.FETCH_DESCRIPTIONS === 'true';

  console.log('=== Tokopedia Handphone Scraper ===');
  console.log(`Fetch descriptions : ${fetchDescriptions}`);
  console.log(`Output file        : ${OUTPUT_FILE}`);
  console.log('');

  // ── Phase 1: collect products from the search API ─────────────────────────
  const allRaw: RawProduct[] = [];

  for (let page = 1; page <= TOTAL_PAGES; page++) {
    console.log(`Fetching page ${page}/${TOTAL_PAGES}...`);
    const raw = await fetchProductPage(page);

    // Take only as many products as needed to reach TOTAL_PRODUCTS
    const needed = TOTAL_PRODUCTS - allRaw.length;
    const slice = raw.slice(0, needed);
    allRaw.push(...slice);

    console.log(
      `  Got ${slice.length} products on this page (running total: ${allRaw.length})`,
    );

    if (page < TOTAL_PAGES) {
      await sleep(SEARCH_DELAY_MS);
    }
  }

  console.log(`\nSearch phase complete. Total products: ${allRaw.length}\n`);

  // ── Phase 2: map raw API response to Product interface ────────────────────
  const products: Product[] = allRaw.map((raw) => ({
    name: raw.name,
    description: '', // populated in Phase 3 if enabled
    imageLink: raw.mediaURL.image,
    price: raw.price.text,
    rating: raw.rating ?? '',
    storeName: raw.shop.name,
  }));

  // ── Phase 3 (optional): fetch descriptions ────────────────────────────────
  // Each description requires a separate PDPMainInfo API call — 100 extra
  // requests in total. This adds ~2.5 minutes of wall-clock time and risks
  // triggering rate limits. Disabled by default; opt in via FETCH_DESCRIPTIONS=true.
  if (fetchDescriptions) {
    console.log(
      `Fetching descriptions for ${products.length} products...\n` +
        '(Expected time: ~2.5 minutes — 1.5 s delay between requests)\n',
    );

    for (let i = 0; i < products.length; i++) {
      const label = `[${i + 1}/${products.length}]`;
      const shortName = products[i].name.substring(0, 50);
      process.stdout.write(`  ${label} ${shortName}... `);

      try {
        products[i].description = await fetchDescription(allRaw[i].url);
        process.stdout.write('OK\n');
      } catch (err) {
        process.stdout.write('FAILED\n');
        console.error(`    → ${(err as Error).message}`);
        // Leave description as "" — one failed product should not abort the run
      }

      if (i < products.length - 1) {
        await sleep(DESCRIPTION_DELAY_MS);
      }
    }

    console.log('');
  } else {
    console.log(
      'Note: Descriptions skipped (FETCH_DESCRIPTIONS=false).\n' +
        '      Set FETCH_DESCRIPTIONS=true in .env to enable.\n' +
        '      Each product requires one extra API call → adds ~2.5 min total.\n',
    );
  }

  // ── Phase 4: write CSV ────────────────────────────────────────────────────
  console.log(`Writing ${products.length} rows to ${OUTPUT_FILE}...`);
  await writeToCSV(products, OUTPUT_FILE);
  console.log(`Done. Open ${OUTPUT_FILE} to view results.`);
}

main().catch((err: Error) => {
  console.error('\nFatal error:', err.message);
  process.exit(1);
});
