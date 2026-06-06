/**
 * Defines the Product interface and related types.
 * The Product interface represents the structure of a product's data as used in the application, including fields for the product's name, description, image link, price, rating, and store name. The description field is set to an empty string when descriptions are not fetched or unavailable, and the rating field is set to an empty string when the product has no ratings yet.
 * The RawProduct interface represents the structure of the raw product data as returned by Tokopedia's API before any processing or transformation. It includes additional fields such as the product URL and a nested mediaURL object for the image link, as well as a nested shop object for the store name and a price object containing both formatted text and numeric price values.
 * These interfaces help ensure type safety and clarity when working with product data throughout the application, allowing for better code maintainability and easier debugging.
 */
export interface Product {
  name: string;
  description: string; // *************** "" when FETCH_DESCRIPTIONS=false or description unavailable
  imageLink: string;
  price: string; // *************** formatted, e.g. "Rp2.599.000"
  rating: string; // *************** "" when the product has no ratings yet
  storeName: string;
}

/**
 * Defines the RawProduct interface, which represents the structure of product data as returned by Tokopedia's API before any processing or transformation. This interface is used to type the raw data received from the API, which may include additional fields or a different structure compared to the final Product interface used in the application.
 * The RawProduct interface includes the following fields:
 * - name: the name of the product
 * - url: the URL to the product page on Tokopedia
 * - mediaURL: an object containing an image field with the URL to the product's image
 * - shop: an object containing a name field with the name of the store selling the product
 * - price: an object containing a text field with the formatted price and a number field with the numeric price value
 * - rating: a string representing the product's rating (e.g., "4.5") or an empty string if there are no ratings yet
 */
export interface RawProduct {
  name: string;
  url: string;
  mediaURL: { image: string };
  shop: { name: string };
  price: { text: string; number: number };
  rating: string;
}
