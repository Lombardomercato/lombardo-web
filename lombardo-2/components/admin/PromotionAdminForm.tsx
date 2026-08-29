"use client";

import { useState } from "react";
import { createPromotionAction, updatePromotionAction } from "@/app/admin/actions";
import type { AdminPromotion } from "@/lib/server/admin/types";
import type { PromotionAppliesTo, PromotionCustomerScope } from "@/lib/promotions/types";
import styles from "@/app/admin/admin.module.css";

function localDate(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

export function PromotionAdminForm({ promotion }: { promotion?: AdminPromotion }) {
  const [appliesTo, setAppliesTo] = useState(promotion?.appliesTo ?? "ALL");
  const [customerScope, setCustomerScope] = useState(promotion?.customerScope ?? "ALL");
  return (
    <form action={promotion ? updatePromotionAction : createPromotionAction} className={styles.customerForm}>
      {promotion ? <input type="hidden" name="promotionId" value={promotion.id} /> : null}
      <label><span>Código</span><input name="code" required maxLength={40} defaultValue={promotion?.code} pattern="[A-Za-z0-9][A-Za-z0-9_-]{2,39}" /></label>
      <label><span>Nombre</span><input name="name" required maxLength={160} defaultValue={promotion?.name} /></label>
      <label><span>Descripción</span><textarea name="description" maxLength={2000} defaultValue={promotion?.description} /></label>
      <label><span>Estado</span><select name="status" defaultValue={promotion?.status ?? "INACTIVE"}><option value="INACTIVE">Desactivada</option><option value="ACTIVE">Activa</option></select></label>
      <label><span>Tipo de descuento</span><select name="discountType" defaultValue={promotion?.discountType ?? "PERCENTAGE"}><option value="PERCENTAGE">Porcentaje</option><option value="FIXED_AMOUNT">Monto fijo</option></select></label>
      <label><span>Porcentaje / monto</span><input name="discountValue" type="number" min="0.01" max="999999999" step="0.01" required defaultValue={promotion?.discountValue ?? 10} /></label>
      <label><span>Inicio</span><input name="startAt" type="datetime-local" defaultValue={localDate(promotion?.startAt)} /></label>
      <label><span>Vencimiento</span><input name="endAt" type="datetime-local" defaultValue={localDate(promotion?.endAt)} /></label>
      <label><span>Compra mínima</span><input name="minimumOrderAmount" type="number" min="0" step="0.01" defaultValue={promotion?.minimumOrderAmount ?? 0} /></label>
      <label><span>Usos máximos totales</span><input name="maxTotalUses" type="number" min="1" step="1" defaultValue={promotion?.maxTotalUses} placeholder="Sin límite" /></label>
      <label><span>Usos máximos por cliente</span><input name="maxUsesPerCustomer" type="number" min="1" step="1" defaultValue={promotion?.maxUsesPerCustomer} placeholder="Sin límite" /></label>
      <label><span>Aplica a</span><select name="appliesTo" value={appliesTo} onChange={(event) => setAppliesTo(event.target.value as PromotionAppliesTo)}><option value="ALL">Todo el catálogo</option><option value="PRODUCTS">Productos</option><option value="CATEGORIES">Categorías</option></select></label>
      {appliesTo === "PRODUCTS" ? <label><span>IDs de productos</span><textarea name="productIds" required defaultValue={promotion?.productIds.join(", ")} placeholder="UUID separados por coma" /></label> : <input type="hidden" name="productIds" value="" />}
      {appliesTo === "CATEGORIES" ? <label><span>Categorías</span><textarea name="categorySlugs" required defaultValue={promotion?.categorySlugs.join(", ")} placeholder="vinos, destilados" /></label> : <input type="hidden" name="categorySlugs" value="" />}
      <label><span>Scope de clientes</span><select name="customerScope" value={customerScope} onChange={(event) => setCustomerScope(event.target.value as PromotionCustomerScope)}><option value="ALL">Todos</option><option value="RETAIL">Retail</option><option value="WHOLESALE">Wholesale</option><option value="BUSINESS">Business</option><option value="CUSTOM">Custom discount</option><option value="SPECIFIC_CUSTOMERS">Clientes específicos</option></select></label>
      {customerScope === "SPECIFIC_CUSTOMERS" ? <label><span>IDs de clientes</span><textarea name="customerAccountIds" required defaultValue={promotion?.customerAccountIds.join(", ")} placeholder="UUID separados por coma" /></label> : <input type="hidden" name="customerAccountIds" value="" />}
      <label className={styles.checkboxField}><input name="stackable" type="checkbox" defaultChecked={promotion?.stackable} /><span>Acumulable con precios especiales</span></label>
      <label className={styles.checkboxField}><input name="firstOrderOnly" type="checkbox" defaultChecked={promotion?.firstOrderOnly} /><span>Sólo primera compra</span></label>
      <div className={styles.customerFormNote}>El cupón se valida de nuevo en el servidor al crear la orden. Los cambios no alteran pedidos anteriores.</div>
      <button className={styles.primaryButton} type="submit">{promotion ? "GUARDAR PROMOCIÓN" : "CREAR PROMOCIÓN"}</button>
    </form>
  );
}
