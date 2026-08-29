import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { ProductDetail } from "@/components/product/ProductDetail";
import { commerceProvider } from "@/lib/commerce";
import { getCurrentCustomerPricingContext } from "@/lib/server/customers/customer-auth";
import type { CustomerPricingContext } from "@/lib/server/customers/types";

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

  return {
    title: product.name,
    description: `${product.description} ${product.presentation}.`,
    alternates: { canonical: `/productos/${product.slug}` },
  };
}

export default async function ProductPage({ params }: ProductPageProps) {
  const [{ slug }, pricingContext] = await Promise.all([
    params,
    getCurrentCustomerPricingContext(),
  ]);
  const product = await getProduct(slug, pricingContext);

  if (!product) notFound();

  return <ProductDetail product={product} />;
}
