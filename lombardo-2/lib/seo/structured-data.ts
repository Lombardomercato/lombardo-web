import { SITE, SITE_CONTACT } from "../config/site.ts";
import type { Product } from "../../types/commerce.ts";
import { absoluteUrl, productSeoDescription } from "./metadata.ts";

type JsonLdValue = Record<string, unknown> | Array<Record<string, unknown>>;

export function serializeJsonLd(value: JsonLdValue) {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

export function onlineStoreStructuredData() {
  return {
    "@context": "https://schema.org",
    "@type": "OnlineStore",
    "@id": `${SITE.url}/#online-store`,
    name: SITE.name,
    alternateName: SITE.alternateName,
    url: SITE.url,
    logo: absoluteUrl(SITE.logoPath),
    description: SITE.description,
    sameAs: [SITE_CONTACT.instagramUrl],
    areaServed: {
      "@type": "City",
      name: "Rosario",
      containedInPlace: {
        "@type": "AdministrativeArea",
        name: "Santa Fe, Argentina",
      },
    },
  };
}

export function breadcrumbStructuredData(
  items: Array<{ name: string; path: string }>,
) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: absoluteUrl(item.path),
    })),
  };
}

function offerAvailability(product: Product) {
  if (product.availability === "AVAILABLE_NOW") {
    return "https://schema.org/InStock";
  }
  if (product.availability === "SUPPLIER_AVAILABLE") {
    return "https://schema.org/PreOrder";
  }
  return "https://schema.org/OutOfStock";
}

export function productStructuredData(product: Product) {
  const url = absoluteUrl(`/productos/${product.slug}`);
  return {
    "@context": "https://schema.org",
    "@type": "Product",
    "@id": `${url}#product`,
    name: product.name,
    description: productSeoDescription(product),
    url,
    sku: product.sku,
    ...(product.images.length
      ? { image: product.images.map((image) => image.src) }
      : {}),
    brand: {
      "@type": "Brand",
      name: product.brand.name,
    },
    category: product.category.name,
    additionalProperty: {
      "@type": "PropertyValue",
      name: "Presentación",
      value: product.presentation,
    },
    offers: {
      "@type": "Offer",
      url,
      priceCurrency: "ARS",
      price: product.price,
      availability: offerAvailability(product),
      itemCondition: "https://schema.org/NewCondition",
      seller: { "@id": `${SITE.url}/#online-store` },
    },
  };
}
