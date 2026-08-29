"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import styles from "@/app/admin/admin.module.css";

export function ProductImageUpload({ productId, hasImages }: { productId: string; hasImages: boolean }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string>();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    setPending(true);
    setError(undefined);
    const form = new FormData(formElement);
    form.set("makePrimary", String(form.get("makePrimary") === "on"));
    try {
      const response = await fetch(`/admin/api/productos/${productId}/imagenes`, { method: "POST", body: form });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error || "No pudimos subir la imagen.");
      formElement.reset();
      setPreview(undefined);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "No pudimos subir la imagen.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form className={styles.imageUploadForm} onSubmit={submit}>
      <div className={styles.uploadPreview}>
        {preview ? <Image src={preview} alt="Vista previa de la imagen seleccionada" width={240} height={180} unoptimized /> : <span>PREVIEW</span>}
      </div>
      <div className={styles.filterField}>
        <label htmlFor="product-image">ARCHIVO · MÁX. 5 MB</label>
        <input
          ref={inputRef}
          id="product-image"
          name="image"
          type="file"
          accept="image/jpeg,image/png,image/webp,image/avif"
          required
          onChange={(event) => {
            if (preview) URL.revokeObjectURL(preview);
            const file = event.currentTarget.files?.[0];
            setPreview(file ? URL.createObjectURL(file) : undefined);
          }}
        />
      </div>
      <div className={styles.filterField}>
        <label htmlFor="altText">DESCRIPCIÓN ACCESIBLE</label>
        <input id="altText" name="altText" maxLength={240} required placeholder="Botella de…" />
      </div>
      <div className={styles.filterField}>
        <label htmlFor="sourceUrl">FUENTE / ORIGEN (OPCIONAL)</label>
        <input id="sourceUrl" name="sourceUrl" type="url" inputMode="url" placeholder="https://…" />
      </div>
      <label className={styles.checkField}>
        <input name="makePrimary" type="checkbox" defaultChecked={!hasImages} /> USAR COMO PRINCIPAL
      </label>
      <label className={styles.checkField}>
        <input name="workflow" type="checkbox" value="source_master" /> SOURCE MASTER · PILOTO, NO PUBLICAR
      </label>
      {error ? <p className={styles.formError} role="alert">{error}</p> : null}
      <button className={styles.primaryButton} type="submit" disabled={pending}>
        {pending ? "SUBIENDO…" : "SUBIR IMAGEN"}
      </button>
    </form>
  );
}
