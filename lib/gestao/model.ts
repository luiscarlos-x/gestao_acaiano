export type Entry = {
  id: string;
  order: number;
  date: string;
  description: string;
  category: string;
  type: "Entrada" | "Saída";
  cents: number;
  payment: string;
  status: "Pendente" | "Concluído";
};
export type Item = {
  id: string;
  name: string;
  group: string;
  unit: string;
  qty: number | null;
  minimum: number | null;
  target: number | null;
};
export type Plan = {
  orders: number;
  ticket: number;
  days: number;
  food: number;
  pack: number;
  delivery: number;
  fee: number;
  fixed: number;
  ads: number;
  margin: number;
};
export type State = {
  revision: number;
  entries: Entry[];
  stock: Item[];
  plan: Plan;
};
export const defaultPlan: Plan = {
  orders: 20,
  ticket: 22,
  days: 30,
  food: 0,
  pack: 1.5,
  delivery: 6,
  fee: 0,
  fixed: 250,
  ads: 100,
  margin: 30,
};
export const methods = [
  "PIX",
  "Cartão Débito",
  "Cartão Crédito",
  "Dinheiro",
  "Transferência",
  "Outro",
];
export const categories = {
  Entrada: ["Venda de açaí", "Outras entradas"],
  Saída: [
    "Insumos",
    "Embalagens",
    "Entrega",
    "Custos fixos",
    "Marketing",
    "Taxas",
    "Outras saídas",
  ],
};
export const units = ["kg", "g", "L", "ml", "un"];
export function stockState(i: Item) {
  return i.qty === null || i.minimum === null || i.target === null
    ? "A conferir"
    : i.qty <= i.minimum
      ? "Repor"
      : "Em dia";
}
export function brl(cents: number) {
  return (cents / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}
export function numberPt(value: number) {
  return value.toLocaleString("pt-BR", { maximumFractionDigits: 3 });
}
export function dayLabel(
  date: string,
  options: Intl.DateTimeFormatOptions = { day: "2-digit", month: "short" },
) {
  return new Date(date + "T12:00:00")
    .toLocaleDateString("pt-BR", options)
    .replace(" de ", " ")
    .replace(" de ", " ")
    .replace(".", "");
}
export function monthLabel(month: string) {
  const value = new Date(month + "-01T12:00:00").toLocaleDateString("pt-BR", {
    month: "long",
    year: "numeric",
  });
  return value.charAt(0).toUpperCase() + value.slice(1);
}
export function today() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Fortaleza",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}
export function sortEntries(entries: Entry[]) {
  return [...entries].sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      a.order - b.order ||
      a.id.localeCompare(b.id),
  );
}
export function simulation(p: Plan) {
  const orders = p.orders * p.days,
    variable = p.food + p.pack + p.delivery + (p.ticket * p.fee) / 100;
  const revenue = orders * p.ticket,
    costs = orders * variable + p.fixed + p.ads,
    contribution = p.ticket - variable;
  const divisor = 1 - (p.margin + p.fee) / 100;
  return {
    orders,
    revenue,
    costs,
    profit: revenue - costs,
    margin: revenue ? ((revenue - costs) * 100) / revenue : null,
    breakEven:
      contribution > 0 ? Math.ceil((p.fixed + p.ads) / contribution) : null,
    price:
      orders > 0 && divisor > 0
        ? (p.food + p.pack + p.delivery + (p.fixed + p.ads) / orders) / divisor
        : null,
  };
}
