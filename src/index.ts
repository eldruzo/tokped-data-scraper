// *************** IMPORT HELPER FUNCTIONS AND TYPES ***************
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

/**
 * The main function orchestrates the entire scraping process, which consists of four phases:
 * 1. Collecting products from the search API: It iterates through the specified number of pages, fetching product data from the search API and accumulating it in an array. A delay is introduced between page requests to avoid overwhelming the server.
 * 2. Mapping raw API response to Product interface: The raw product data obtained from the search API is transformed into a structured format defined by the Product interface, preparing it for further processing and eventual output.
 * 3. Fetching descriptions (optional): If enabled via an environment variable, this phase makes additional API calls to fetch detailed descriptions for each product. This step is time-consuming and may trigger rate limits, so it is disabled by default.
 * 4. Writing CSV: Finally, the collected and processed product data is written to a CSV file using the writeToCSV function, allowing for easy access and analysis of the scraped data.
 * 
 * The function includes error handling to ensure that any issues encountered during the scraping process are logged
 */
async function main(): Promise<void> {
  // *************** Determine whether to fetch product descriptions based on the FETCH_DESCRIPTIONS environment variable. This allows users to opt in or out of the description fetching phase, which can significantly increase the total execution time due to the need for additional API calls. By default, fetching descriptions is enabled unless explicitly set to false.
  const fetchDescriptions = typeof process.env.FETCH_DESCRIPTIONS === 'boolean' 
    ? process.env.FETCH_DESCRIPTIONS
    : true; // *************** default to true if not set

  // *************** Log initial configuration and settings to the console for user awareness before starting the scraping process. This includes whether descriptions will be fetched and the output file name, providing clarity on the script's behavior and expected output.
  console.log('=== Tokopedia Handphone Scraper ===');
  console.log(`Fetch descriptions : ${fetchDescriptions}`);
  console.log(`Output file        : ${OUTPUT_FILE}`);
  console.log('');

  // *************** Phase 1: collect products from the search API 
  const allRaw: RawProduct[] = [];

  // *************** Loop through the specified number of pages, fetching product data from the search API for each page. The function fetchProductPage is called to retrieve the raw product data for the current page, which is then accumulated in the allRaw array. After each page is processed, a delay is introduced before the next request to avoid overwhelming the server and to mimic more natural browsing behavior.
  for (let page = 1; page <= TOTAL_PAGES; page++) {
    // *************** Log the current page being fetched to provide feedback on the progress of the scraping process. This helps users understand which page is currently being processed and how many pages are left, improving the transparency of the script's execution.
    console.log(`Fetching page ${page}/${TOTAL_PAGES}...`);

    // *************** Fetch the raw product data for the current page using the fetchProductPage function, which makes an API call to retrieve the search results. The response is expected to contain an array of RawProduct objects, which will be processed in subsequent steps to extract relevant information and map it to the Product interface.
    const raw = await fetchProductPage(page);

    // *************** Take only as many products as needed to reach TOTAL_PRODUCTS
    const needed = TOTAL_PRODUCTS - allRaw.length;
    const slice = raw.slice(0, needed);
    allRaw.push(...slice);

    // *************** Log the number of products obtained from the current page and the running total of products collected so far. This provides feedback on the progress of the data collection phase and helps users understand how many products have been gathered from each page and in total.
    console.log(
      `  Got ${slice.length} products on this page (running total: ${allRaw.length})`,
    );

    // *************** If there are more pages to fetch, wait for the specified delay before making the next request. This helps avoid overwhelming the server with rapid requests and mimics more natural browsing behavior, reducing the likelihood of triggering rate limits or bot detection mechanisms.
    if (page < TOTAL_PAGES) {
      await sleep(SEARCH_DELAY_MS);
    }
  }

  // *************** Log the completion of the search phase and the total number of products collected. This indicates that the initial data collection from the search API is complete and provides a summary of the results obtained before moving on to the next phases of processing and output.
  console.log(`\nSearch phase complete. Total products: ${allRaw.length}\n`);

  // *************** Phase 2: map raw API response to Product interface 
  const products: Product[] = allRaw.map((raw) => ({
    name: raw.name,
    description: '', // *************** populated in Phase 3 if enabled
    imageLink: raw.mediaURL.image,
    price: raw.price.text,
    rating: raw.rating ?? '',
    storeName: raw.shop.name,
  }));

  // *************** Phase 3 (optional): fetch descriptions
  // *************** Each description requires a separate PDPMainInfo API call — 100 extra
  // *************** requests in total. This adds ~2.5 minutes of wall-clock time and risks
  // *************** triggering rate limits. Disabled by default; opt in via FETCH_DESCRIPTIONS=true.
  if (fetchDescriptions) {
    // *************** Log the start of the description fetching phase and provide an estimate of the expected time to complete this phase based on the number of products and the delay between requests. This helps set user expectations for the duration of this optional phase, which can be time-consuming due to the need for additional API calls for each product.
    console.log(
      `Fetching descriptions for ${products.length} products...\n` +
        '(Expected time: ~2.5 minutes — 1.5 s delay between requests)\n',
    );

    // *************** Loop through each product and fetch its description using the fetchDescription function, which makes an API call to retrieve the product's detailed information. The function handles potential errors gracefully by logging any issues encountered during the fetching process and leaving the description as an empty string if it cannot be retrieved. After each description is fetched (or fails), a delay is introduced before proceeding to the next product to avoid overwhelming the server and to mimic more natural browsing behavior.
    for (let i = 0; i < products.length; i++) {
      const label = `[${i + 1}/${products.length}]`;
      const shortName = products[i].name.substring(0, 50);
      process.stdout.write(`  ${label} ${shortName}... `);

      try {
        // *************** Attempt to fetch the product description using the fetchDescription function, which takes the product URL as input and returns the cleaned description text. If the description is successfully fetched, it is assigned to the corresponding product's description field. If any error occurs during this process (e.g., network issues, invalid URL, unexpected response structure), the error is caught and logged, and the description remains an empty string to ensure that one failed product does not abort the entire run.
        products[i].description = await fetchDescription(allRaw[i].url);
        process.stdout.write('OK\n');
      } catch (err) {
        process.stdout.write('FAILED\n');
        console.error(`    → ${(err as Error).message}`);
        // ***************Leave description as "" — one failed product should not abort the run
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

  // *************** Phase 4: write CSV 
  console.log(`Writing ${products.length} rows to ${OUTPUT_FILE}...`);
  await writeToCSV(products, OUTPUT_FILE);
  console.log(`Done. Open ${OUTPUT_FILE} to view results.`);
}

/**
 * Invoke the main function and catch any unhandled errors that may occur during the execution of the scraping process. If a fatal error is encountered, it is logged to the console with a message indicating that it is a fatal error, and the process exits with a non-zero status code to indicate that the script did not complete successfully. This ensures that any unexpected issues are properly reported and that the script does not fail silently.
 */
main().catch((err: Error) => {
  console.error('\nFatal error:', err.message);
  process.exit(1);
});
