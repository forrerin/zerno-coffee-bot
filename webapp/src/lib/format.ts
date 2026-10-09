import type { CartLine, MenuData, Modifier, Order, Product } from "./types";

export const rub = (n: number) => `${n.toLocaleString("ru-RU")} ₽`;

/** Курс для демонстрации оплаты звёздами */
export const toStars = (rubles: number) => Math.max(1, Math.ceil(rubles / 1.6));

export function greeting(name: string, d = new Date()): string {
  const h = d.getHours();
  const hello = h >= 5 && h < 12 ? "Доброе утро" : h >= 12 && h < 17 ? "Добрый день" : h >= 17 && h < 23 ? "Добрый вечер" : "Доброй ночи";
  return name ? `${hello}, ${name}` : hello;
}

export function plural(n: number, forms: [string, string, string]): string {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return forms[0];
  if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return forms[1];
  return forms[2];
}

export const lineKey = (l: Pick<CartLine, "product_id" | "size" | "modifier_ids">) =>
  `${l.product_id}|${l.size ?? ""}|${[...l.modifier_ids].sort((a, b) => a - b).join(",")}`;

export function minPrice(p: Product): number {
  return p.sizes.length ? Math.min(...p.sizes.map((s) => s.price)) : p.base_price;
}

/** Предварительная цена на клиенте — только для отображения, итог считает сервер */
export function unitPrice(p: Product, size: string | null, modIds: number[], mods: Map<number, Modifier>): number {
  const base = p.sizes.length ? (p.sizes.find((s) => s.size === size)?.price ?? minPrice(p)) : p.base_price;
  return base + modIds.reduce((sum, id) => sum + (mods.get(id)?.price ?? 0), 0);
}

export function indexMenu(menu: MenuData | null) {
  return {
    products: new Map((menu?.products ?? []).map((p) => [p.id, p])),
    modifiers: new Map((menu?.modifiers ?? []).map((m) => [m.id, m])),
  };
}

export function time(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
}

export function dateTime(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  const t = d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
  return sameDay ? `Сегодня, ${t}` : `${d.toLocaleDateString("ru-RU", { day: "numeric", month: "short" })}, ${t}`;
}

export const reduceMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;


/** Позиции заказа, которые всё ещё есть в меню, — для мгновенного «Повторить» без запроса к серверу */
export function linesFromOrder(order: Order, menu: MenuData | null): Omit<CartLine, "key">[] {
  const { products, modifiers } = indexMenu(menu);
  const lines: Omit<CartLine, "key">[] = [];
  for (const item of order.items) {
    const p = products.get(item.product_id);
    if (!p) continue;
    if (p.sizes.length ? !p.sizes.some((s) => s.size === item.size) : item.size) continue;
    lines.push({
      product_id: p.id,
      size: item.size,
      modifier_ids: item.modifiers.map((m) => m.id).filter((id) => modifiers.has(id)),
      qty: item.qty,
    });
  }
  return lines;
}
