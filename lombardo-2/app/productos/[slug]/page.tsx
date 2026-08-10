import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { ProductDetail } from "@/components/product/ProductDetail";
import { commerceProvider } from "@/lib/commerce";

interface ProductPageProps {
  params: Promise<{ slug: string }>;
}

const getProduct = cache((slug: string) =>
  commerceProvider.getProductBySlug(slug),
);

export async function generateStaticParams() {
  const products = await commerceProvider.getProducts();
  return products.map((product) => ({ slug: product.slug }));
}

export async function generateMetadata({
  params,
}: ProductPageProps): Promise<Metadata> {
  const { slug } = await params;
  const product = await getProduct(slug);

  if (!product) return { title: "Producto no encontrado" };

  return {
    title: product.name,
    description: `${product.description} ${product.presentation}.`,
  };
}

export default async function ProductPage({ params }: ProductPageProps) {
  const { slug } = await params;
  const product = await getProduct(slug);

  if (!product) notFound();

  return <ProductDetail product={product} />;
}
