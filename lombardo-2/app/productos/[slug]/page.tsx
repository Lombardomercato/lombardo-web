import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { ProductDetail } from "@/components/product/ProductDetail";
import { JsonLd } from "@/components/seo/JsonLd";
import { commerceProvider } from "@/lib/commerce";
import { getCurrentCustomerPricingContext } from "@/lib/server/customers/customer-auth";
import type { CustomerPricingContext } from "@/lib/server/customers/types";
import { productSeoDescription } from "@/lib/seo/metadata";
import {
  breadcrumbStructuredData,
  productStructuredData,
} from "@/lib/seo/structured-data";

interface ProductPageProps {
  params: Promise<{ slug: string }>;
}

export const dynamic = "force-dynamic";

const getProduct = cache((slug: string, pricingContext: CustomerPricingContext) =>
  commerceProvider.getProductBySlug(slug, pricingContext),
);

export async function generateMetadata({
  params,
}: ProductPageProps): Promise<Metadata> {
  const [{ slug }, pricingContext] = await Promise.all([
    params,
    getCurrentCustomerPricingContext(),
  ]);
  const product = await getProduct(slug, pricingContext);

  if (!product) return { title: "Producto no encontrado" };

  const description = productSeoDescription(product);
  return {
    title: product.name,
    description,
    alternates: { canonical: `/productos/${product.slug}` },
    openGraph: {
      title: `${product.name} | LOMBARDO.`,
      description,
      url: `/productos/${product.slug}`,
      type: "website",
      ...(product.images.length
        ? {
            images: product.images.map((image) => ({
              url: image.src,
              alt: image.alt,
              width: image.width,
              height: image.height,
            })),
          }
        : {}),
    },
  };
}

export default async function ProductPage({ params }: ProductPageProps) {
  const [{ slug }, pricingContext] = await Promise.all([
    params,
    getCurrentCustomerPricingContext(),
  ]);
  const product = await getProduct(slug, pricingContext);

  if (!product) notFound();

  return (
    <>
      <JsonLd
        data={[
          productStructuredData(product),
          breadcrumbStructuredData([
            { name: "Inicio", path: "/" },
            { name: "Productos", path: "/productos" },
            {
              name: product.category.name,
              path: `/categorias/${product.category.slug}`,
            },
            { name: product.name, path: `/productos/${product.slug}` },
          ]),
        ]}
      />
      <ProductDetail product={product} />
    </>
  );
}
