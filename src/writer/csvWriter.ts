// *************** IMPORT LIBRARIES ***************
import { createObjectCsvWriter } from 'csv-writer';
import { Product } from '../model/product';

/**
 * function writeToCSV(products: Product[], outputPath: string): Promise<void> {
 * This function takes an array of Product objects and an output file path, and writes the product data to a CSV file at the specified location. It uses the csv-writer library to create a CSV writer instance with the appropriate headers corresponding to the fields of the Product interface. The function then calls writeRecords on the writer instance, passing in the array of products, which generates the CSV file with the product data formatted according to the defined headers.
 * @param products 
 * @param outputPath 
 * The function performs the following steps:
 * 1. Creates a CSV writer instance using createObjectCsvWriter, specifying the output file path and defining the headers that map to the fields of the Product interface (name, description, imageLink, price, rating, storeName).
 * 2. Calls the writeRecords method on the writer instance, passing in the array of Product objects. This method processes the product data and writes it to the specified CSV file in a structured format with the defined headers.
 * 3. The function returns a Promise that resolves when the writing process is complete, allowing for asynchronous handling of the file writing operation.  
 */
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

  // *************** Write the product records to the CSV file using the writeRecords method of the writer instance. This method takes the array of Product objects and processes them according to the defined headers, generating a CSV file at the specified output path with the product data formatted correctly.
  await writer.writeRecords(products);
}
