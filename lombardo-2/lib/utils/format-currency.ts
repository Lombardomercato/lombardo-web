const currencyFormatter = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  currencyDisplay: "narrowSymbol",
  maximumFractionDigits: 0,
});

export const formatCurrency = (amount: number) =>
  currencyFormatter.format(amount).replace(/\u00a0/g, " ");
