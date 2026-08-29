"use client";

import { useState, type FormEvent } from "react";
import { useCart } from "@/components/cart/CartProvider";
import styles from "./CouponForm.module.css";

export function CouponForm() {
  const {
    appliedPromotion,
    promotionStatus,
    promotionMessage,
    applyCoupon,
    removeCoupon,
  } = useCart();
  const [code, setCode] = useState("");

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!code.trim() || promotionStatus === "loading") return;
    void applyCoupon(code);
  };

  if (appliedPromotion) {
    return (
      <section className={styles.applied} aria-label="Cupón aplicado">
        <div><span>APLICADO</span><strong>{appliedPromotion.code}</strong></div>
        <button type="button" onClick={removeCoupon}>QUITAR</button>
      </section>
    );
  }

  return (
    <form className={styles.form} onSubmit={submit}>
      <label htmlFor="coupon-code">¿TENÉS UN CUPÓN?</label>
      <div>
        <input
          id="coupon-code"
          value={code}
          onChange={(event) => setCode(event.target.value.toLocaleUpperCase("en-US"))}
          maxLength={40}
          autoComplete="off"
          placeholder="CÓDIGO"
          aria-describedby="coupon-status"
        />
        <button type="submit" disabled={!code.trim() || promotionStatus === "loading"}>
          {promotionStatus === "loading" ? "VALIDANDO…" : "APLICAR"}
        </button>
      </div>
      <p id="coupon-status" role={promotionStatus === "error" ? "alert" : "status"}>
        {promotionMessage}
      </p>
    </form>
  );
}
