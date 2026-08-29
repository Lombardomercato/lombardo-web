"use client";

import { useState } from "react";
import { LombardoProductRender } from "@/components/product/LombardoProductRender";
import type { AdminProductImageRender } from "@/lib/server/admin/types";
import { formatCurrency } from "@/lib/utils/format-currency";
import styles from "./ProductImageSystemPilot.module.css";

export function ProductImageSystemPilot({ products }: { products: AdminProductImageRender[] }) {
  const [view, setView] = useState<"render" | "master">("render");

  return (
    <>
      <div className={styles.toolbar} role="group" aria-label="Comparar master y render">
        <p>{products.length} PRODUCTOS · CONTEXTO DE CATÁLOGO</p>
        <button type="button" data-active={view === "render"} onClick={() => setView("render")}>LOMBARDO RENDER</button>
        <button type="button" data-active={view === "master"} onClick={() => setView("master")}>SOURCE MASTER</button>
      </div>
      <div className={styles.grid}>
        {products.map((product, index) => (
          <article className={styles.card} key={product.id}>
            <LombardoProductRender
              src={product.masterUrl}
              alt={product.masterAlt}
              name={product.name}
              sku={product.sku}
              presentation={product.presentation}
              variant={product.variant}
              scale={product.scale}
              priority={index < 2}
              showMaster={view === "master"}
            />
            <div className={styles.info}>
              <p>{product.brand} · {product.presentation}</p>
              <h2>{product.name}</h2>
              <span>{product.price ? formatCurrency(product.price) : "PRECIO NO DISPONIBLE"}</span>
              <small>{product.source.toLocaleUpperCase("es-AR")} · RENDER V{product.renderVersion}</small>
            </div>
          </article>
        ))}
      </div>
    </>
  );
}
