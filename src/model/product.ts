// Shape written to products.csv
export interface Product {
  name: string;
  description: string; // "" when FETCH_DESCRIPTIONS=false or description unavailable
  imageLink: string;
  price: string; // formatted, e.g. "Rp2.599.000"
  rating: string; // "" when the product has no ratings yet
  storeName: string;
}

// Raw shape returned by SearchProductV5Query before mapping to Product
export interface RawProduct {
  name: string;
  url: string;
  mediaURL: { image: string };
  shop: { name: string };
  price: { text: string; number: number };
  rating: string;
}
