import { create } from "zustand";
import { api, initApi } from "./lib/api";
import { lineKey } from "./lib/format";
import type { CartLine, MenuData, User } from "./lib/types";

export type Tab = "home" | "menu" | "orders" | "profile" | "admin";
export const TAB_ORDER: Tab[] = ["home", "menu", "orders", "profile", "admin"];
export type Screen = { name: "cart" } | { name: "success"; orderId: number } | { name: "adminProduct"; id: number | null };

interface Fly {
  id: number;
  from: { x: number; y: number };
  art: string;
}

interface AppState {
  dark: boolean;
  me: User | null;
  menu: MenuData | null;
  error: string | null;

  tab: Tab;
  stack: Screen[];
  sheetProductId: number | null;
  /** откуда открыли карточку — для перелёта фото из карточки в шторку */
  sheetOrigin: { x: number; y: number; w: number; h: number } | null;
  sheetCount: number;
  /** направление последнего перехода: 1 — вперёд/вправо, -1 — назад/влево */
  navDir: number;
  menuCategory: number | null;

  cart: CartLine[];
  cartBump: number;
  /** сколько раз товар «приземлился» в корзину — для отклика плашки */
  cartLand: number;
  fly: Fly | null;
  toast: { id: number; text: string; tone: "ok" | "error" } | null;

  setDark: (dark: boolean) => void;
  setTab: (tab: Tab) => void;
  push: (s: Screen) => void;
  back: () => void;
  reset: (tab: Tab) => void;
  openProduct: (id: number | null, origin?: { x: number; y: number; w: number; h: number } | null) => void;
  setMenuCategory: (id: number | null) => void;

  addToCart: (line: Omit<CartLine, "key">, from?: { x: number; y: number }, art?: string) => void;
  setQty: (key: string, qty: number) => void;
  removeLine: (key: string) => void;
  replaceCart: (lines: Omit<CartLine, "key">[]) => void;

  showToast: (text: string, tone?: "ok" | "error") => void;
  boot: () => Promise<void>;
  refreshMe: () => Promise<void>;
}

const CART_KEY = "zerno-cart-v1";

/** Открытые bottom sheet'ы (сверху — последний): их закрывает кнопка «Назад» */
export const sheetStack: (() => void)[] = [];

export function registerSheet(close: () => void): () => void {
  sheetStack.push(close);
  useApp.setState({ sheetCount: sheetStack.length });
  return () => {
    const i = sheetStack.lastIndexOf(close);
    if (i >= 0) sheetStack.splice(i, 1);
    useApp.setState({ sheetCount: sheetStack.length });
  };
}

const BOOT_KEY = "zerno-boot-v1";

function readBootCache(): { me: User; menu: MenuData } | null {
  try {
    const raw = localStorage.getItem(BOOT_KEY);
    return raw ? (JSON.parse(raw) as { me: User; menu: MenuData }) : null;
  } catch {
    return null;
  }
}

function writeBootCache(data: { me: User; menu: MenuData }) {
  try {
    localStorage.setItem(BOOT_KEY, JSON.stringify(data));
  } catch {
    /* приватный режим / переполнение */
  }
}

function loadLocalCart(): CartLine[] {
  try {
    const raw = localStorage.getItem(CART_KEY);
    return raw ? (JSON.parse(raw) as CartLine[]) : [];
  } catch {
    return [];
  }
}

const withKey = (l: Omit<CartLine, "key">): CartLine => ({ ...l, key: lineKey(l) });

export const useApp = create<AppState>((set, get) => ({
  dark: false,
  me: null,
  menu: null,
  error: null,

  tab: "home",
  stack: [],
  sheetProductId: null,
  sheetOrigin: null,
  sheetCount: 0,
  navDir: 0,
  menuCategory: null,

  cart: loadLocalCart(),
  cartBump: 0,
  cartLand: 0,
  fly: null,
  toast: null,

  setDark: (dark) => set({ dark }),
  setTab: (tab) =>
    set((st) => ({
      tab,
      stack: [],
      sheetProductId: null,
      navDir: st.stack.length ? -1 : Math.sign(TAB_ORDER.indexOf(tab) - TAB_ORDER.indexOf(st.tab)),
    })),
  push: (s) => set((st) => ({ stack: [...st.stack, s], sheetProductId: null, navDir: 1 })),
  back: () => {
    // «Назад» сначала закрывает верхний открытый лист (карточка напитка, оплата), потом экран
    const closeTop = sheetStack[sheetStack.length - 1];
    if (closeTop) closeTop();
    else set((st) => ({ stack: st.stack.slice(0, -1), navDir: -1 }));
  },
  reset: (tab) => set({ tab, stack: [], sheetProductId: null, navDir: -1 }),
  openProduct: (id, origin = null) => set({ sheetProductId: id, sheetOrigin: origin }),
  setMenuCategory: (id) => set({ menuCategory: id }),

  addToCart: (line, from, art) =>
    set((st) => {
      const l = withKey(line);
      const exists = st.cart.find((c) => c.key === l.key);
      const cart = exists
        ? st.cart.map((c) => (c.key === l.key ? { ...c, qty: Math.min(c.qty + l.qty, 20) } : c))
        : [...st.cart, l];
      return {
        cart,
        cartBump: st.cartBump + 1,
        fly: from ? { id: Date.now(), from, art: art ?? "art:cappuccino" } : st.fly,
      };
    }),
  setQty: (key, qty) =>
    set((st) => ({
      cart: qty <= 0 ? st.cart.filter((c) => c.key !== key) : st.cart.map((c) => (c.key === key ? { ...c, qty } : c)),
    })),
  removeLine: (key) => set((st) => ({ cart: st.cart.filter((c) => c.key !== key) })),
  replaceCart: (lines) => set({ cart: lines.map(withKey) }),

  showToast: (text, tone = "ok") => set({ toast: { id: Date.now(), text, tone } }),

  boot: async () => {
    // мгновенный старт: показываем меню и профиль из прошлого открытия, свежие данные — в фоне
    const cached = readBootCache();
    if (cached && !get().menu) set({ me: cached.me, menu: cached.menu, error: null });
    try {
      await initApi();
      const [me, menu, serverCart] = await Promise.all([api.me(), api.menu(), api.cart()]);
      set({ me, menu, error: null });
      writeBootCache({ me, menu });
      // корзина живёт на сервере (Redis) — туда же кладёт товары бот
      const source = serverCart.items.length ? serverCart.items : get().cart;
      // убираем позиции, которые успели скрыть из меню, иначе заказ не оформить
      const products = new Map(menu.products.map((p) => [p.id, p]));
      const modIds = new Set(menu.modifiers.map((m) => m.id));
      const valid = source
        .filter((l) => {
          const p = products.get(l.product_id);
          if (!p) return false;
          return p.sizes.length ? p.sizes.some((s) => s.size === l.size) : !l.size;
        })
        .map((l) => ({ ...l, modifier_ids: l.modifier_ids.filter((id) => modIds.has(id)) }));
      get().replaceCart(valid);
      if (valid.length !== serverCart.items.length || !serverCart.items.length) api.saveCart(get().cart).catch(() => undefined);
    } catch (e) {
      // есть данные из прошлого открытия — работаем с ними, ошибку не показываем
      if (!get().menu) set({ error: e instanceof Error ? e.message : "Нет связи с сервером" });
    }
  },
  refreshMe: async () => {
    try {
      set({ me: await api.me() });
    } catch {
      /* не критично */
    }
  },
}));

// Сохранение корзины: локально сразу, на сервер — с небольшой задержкой
let syncTimer: number | undefined;
let lastCart = useApp.getState().cart;
useApp.subscribe((st) => {
  if (st.cart === lastCart) return;
  lastCart = st.cart;
  try {
    localStorage.setItem(CART_KEY, JSON.stringify(st.cart));
  } catch {
    /* приватный режим */
  }
  if (!st.me) return;
  window.clearTimeout(syncTimer);
  syncTimer = window.setTimeout(flushCart, 500);
});

function flushCart() {
  if (syncTimer === undefined) return;
  window.clearTimeout(syncTimer);
  syncTimer = undefined;
  api.saveCart(useApp.getState().cart).catch(() => undefined);
}

// Mini App закрывают сразу после изменения — отправляем корзину, не дожидаясь задержки
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") flushCart();
});
window.addEventListener("pagehide", flushCart);
