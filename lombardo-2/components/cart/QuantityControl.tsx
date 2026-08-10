import styles from "./QuantityControl.module.css";

interface QuantityControlProps {
  label: string;
  quantity: number;
  onChange: (quantity: number) => void;
  inverse?: boolean;
}

export function QuantityControl({
  label,
  quantity,
  onChange,
  inverse = false,
}: QuantityControlProps) {
  return (
    <div
      className={`${styles.control} ${inverse ? styles.inverse : ""}`}
      role="group"
      aria-label={`Cantidad de ${label}`}
    >
      <button
        type="button"
        onClick={() => onChange(quantity - 1)}
        disabled={quantity <= 1}
        aria-label={`Quitar una unidad de ${label}`}
      >
        −
      </button>
      <output aria-live="polite" aria-label={`${quantity} unidades`}>
        {String(quantity).padStart(2, "0")}
      </output>
      <button
        type="button"
        onClick={() => onChange(quantity + 1)}
        disabled={quantity >= 99}
        aria-label={`Agregar una unidad de ${label}`}
      >
        +
      </button>
    </div>
  );
}
