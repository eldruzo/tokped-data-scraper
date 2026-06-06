import { createObjectCsvWriter } from 'csv-writer';
import { Product } from '../model/product';

export async function writeToCSV(
  products: Product[],
  outputPath: string,
): Promise<void> {
  const writer = createObjectCsvWriter({
    path: outputPath,
    header: [
      { id: 'name', title: 'name' },
      { id: 'description', title: 'description' },
      { id: 'imageLink', title: 'imageLink' },
      { id: 'price', title: 'price' },
      { id: 'rating', title: 'rating' },
      { id: 'storeName', title: 'storeName' },
    ],
  });

  await writer.writeRecords(products);
}
