import { tg } from "./tg";
import type {
  Broadcast,
  BroadcastsResponse,
  CartLine,
  HomeData,
  MenuData,
  Modifier,
  Order,
  Product,
  Promo,
  Quote,
  Stats,
  User,
} from "./types";

/**
 * Адрес API. Если Mini App лежит на статическом хостинге (GitHub Pages), бот передаёт
 * адрес туннеля параметром ?api=. Принимаем только хосты из белого списка — иначе
 * чужая ссылка могла бы увести initData пользователя на сторонний сервер.
 */
const API_HOSTS = ((import.meta.env.VITE_API_HOSTS as string | undefined) ?? "lhr.life,trycloudflare.com")
  .split(",")
  .map((h) => h.trim())
  .filter(Boolean);

const FROM_BUILD = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, "") ?? "";
// gist, куда локальный сервер записывает свой текущий адрес (бесплатные туннели меняют адрес при перезапуске)
const API_GIST = import.meta.env.VITE_API_GIST as string | undefined;

function allowedOrigin(candidate: string | null | undefined): string | null {
  if (!candidate) return null;
  try {
    const u = new URL(candidate);
    const ok = u.protocol === "https:" && API_HOSTS.some((h) => u.hostname === h || u.hostname.endsWith("." + h));
    return ok ? u.origin : null;
  } catch {
    return null;
  }
}

/**
 * Адрес API из gist. Берём «сырой» файл с gist.githubusercontent.com, а не api.github.com:
 * у API GitHub лимит 60 запросов в час на IP без авторизации — он исчерпывался, и Mini App
 * не мог узнать новый адрес туннеля. Уникальный параметр обходит 5-минутный кеш CDN.
 * VITE_API_GIST: "логин/id".
 */
async function fromGist(): Promise<string | null> {
  if (!API_GIST) return null;
  const path = API_GIST.includes("/") ? API_GIST : `forrerin/${API_GIST}`;
  try {
    const res = await fetch(`https://gist.githubusercontent.com/${path}/raw/zerno-api.json?t=${Date.now()}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(6000),
    });
    const data = (await res.json()) as { api?: string };
    return allowedOrigin(data.api);
  } catch {
    return null;
  }
}

let BASE = FROM_BUILD;

const BASE_KEY = "zerno-api-base";

function remember(base: string) {
  try {
    localStorage.setItem(BASE_KEY, base);
  } catch {
    /* приватный режим */
  }
}

/**
 * Находит рабочий адрес API. Последний рабочий адрес используется сразу, без ожидания —
 * если он устарел, первый же запрос перечитает адрес из gist и повторится (см. request).
 */
export async function initApi(): Promise<void> {
  const hint = allowedOrigin(new URLSearchParams(window.location.search).get("api"));
  if (!hint && !API_GIST) return; // обычный режим: API на том же домене
  let saved: string | null = null;
  try {
    saved = allowedOrigin(localStorage.getItem(BASE_KEY));
  } catch {
    saved = null;
  }
  // адрес бесплатного туннеля меняется каждые 15–20 минут: свежий берём из gist
  // (прямая ссылка, ~0.3 с), иначе первый запрос висел бы на мёртвом адресе до таймаута
  const fresh = await fromGist();
  BASE = fresh ?? saved ?? hint ?? BASE;
  if (fresh) remember(fresh);
}

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

// Туннель отвечает ошибкой шлюза, когда его адрес устарел или соединение оборвалось
const GATEWAY_ERRORS = new Set([502, 503, 504, 530]);
const REQUEST_TIMEOUT = 8000; // мёртвый адрес туннеля не держит интерфейс долго

async function send(path: string, init: RequestInit, headers: Headers): Promise<Response> {
  return fetch(BASE + path, { ...init, headers, signal: AbortSignal.timeout(REQUEST_TIMEOUT) });
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  const initData = tg.initData();
  if (initData) headers.set("Authorization", `tma ${initData}`);
  if (init.body && !(init.body instanceof FormData)) headers.set("Content-Type", "application/json");
  const idempotent = !init.method || ["GET", "PUT", "DELETE"].includes(init.method);

  let res: Response;
  try {
    res = await send(path, init, headers);
    if (GATEWAY_ERRORS.has(res.status)) throw new Error("gateway");
  } catch {
    // сеть оборвалась или туннель сменил адрес: берём свежий адрес из gist и повторяем.
    // POST повторяем, только если адрес сменился, — старый туннель запрос точно не получил
    const changed = await refreshApi();
    if (!idempotent && !changed) throw new ApiError("Нет связи с кофейней. Проверьте интернет и попробуйте ещё раз", 0);
    try {
      res = await send(path, init, headers);
    } catch {
      throw new ApiError("Нет связи с кофейней. Проверьте интернет и попробуйте ещё раз", 0);
    }
  }

  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail = (data as { detail?: unknown }).detail;
    const msg = typeof detail === "string" ? detail : "Что-то пошло не так. Попробуйте ещё раз";
    throw new ApiError(msg, res.status);
  }
  return data as T;
}

let refreshing: Promise<boolean> | null = null;

/** Перечитывает адрес API из gist. true — если адрес изменился. Параллельные вызовы объединяются. */
async function refreshApi(): Promise<boolean> {
  if (!API_GIST) return false;
  refreshing ??= (async () => {
    const fresh = await fromGist();
    const changed = !!fresh && fresh !== BASE;
    if (fresh) {
      BASE = fresh;
      remember(fresh);
    }
    return changed;
  })().finally(() => {
    setTimeout(() => (refreshing = null), 2000);
  });
  return refreshing;
}

const json = (method: string, body?: unknown): RequestInit => ({
  method,
  body: body === undefined ? undefined : JSON.stringify(body),
});

export const mediaUrl = (url: string) => (url.startsWith("/media/") ? BASE + url : url);

type LineIn = Pick<CartLine, "product_id" | "size" | "modifier_ids" | "qty">;
const strip = (items: CartLine[]): LineIn[] =>
  items.map(({ product_id, size, modifier_ids, qty }) => ({ product_id, size, modifier_ids, qty }));

export const api = {
  me: () => request<User>("/api/me"),
  updateMe: (data: Partial<Pick<User, "birthday" | "notifications_on">>) => request<User>("/api/me", json("PATCH", data)),
  menu: () => request<MenuData>("/api/menu"),
  home: () => request<HomeData>("/api/home"),

  cart: () => request<{ items: LineIn[] }>("/api/cart"),
  saveCart: (items: CartLine[]) => request<{ items: LineIn[] }>("/api/cart", json("PUT", { items: strip(items) })),
  quote: (items: CartLine[], promo_code?: string) =>
    request<Quote>("/api/quote", json("POST", { items: strip(items), promo_code: promo_code || null })),
  checkPromo: (code: string) => request<{ code: string }>("/api/promo/check", json("POST", { code })),

  createOrder: (items: CartLine[], opts: { promo_code?: string; ready_at?: string | null; comment?: string }) =>
    request<Order>("/api/orders", json("POST", { items: strip(items), ...opts, promo_code: opts.promo_code || null })),
  orders: () => request<Order[]>("/api/orders"),
  order: (id: number) => request<Order>(`/api/orders/${id}`),
  pay: (id: number, method: "card" | "stars") => request<Order>(`/api/orders/${id}/pay`, json("POST", { method })),
  cancel: (id: number) => request<Order>(`/api/orders/${id}/cancel`, json("POST")),
  repeat: (id: number) => request<{ items: LineIn[] }>(`/api/orders/${id}/repeat`, json("POST")),

  admin: {
    orders: (filter?: string) => request<Order[]>(`/api/admin/orders${filter ? `?status_filter=${filter}` : ""}`),
    setStatus: (id: number, status: string) => request<Order>(`/api/admin/orders/${id}`, json("PATCH", { status })),
    menu: () => request<{ products: Product[]; modifiers: Modifier[] }>("/api/admin/menu"),
    saveProduct: (p: Omit<Product, "id"> & { id?: number }) =>
      p.id
        ? request<Product>(`/api/admin/products/${p.id}`, json("PUT", p))
        : request<Product>("/api/admin/products", json("POST", p)),
    toggleProduct: (id: number) => request<Product>(`/api/admin/products/${id}/toggle`, json("POST")),
    saveModifier: (m: Omit<Modifier, "id"> & { id?: number }) =>
      m.id
        ? request<Modifier>(`/api/admin/modifiers/${m.id}`, json("PUT", m))
        : request<Modifier>("/api/admin/modifiers", json("POST", m)),
    upload: (file: File) => {
      const body = new FormData();
      body.append("file", file);
      return request<{ url: string }>("/api/admin/upload", { method: "POST", body });
    },
    promos: () => request<Promo[]>("/api/admin/promos"),
    createPromo: (p: Omit<Promo, "id" | "used_count">) => request<Promo>("/api/admin/promos", json("POST", p)),
    expirePromo: (id: number) => request<void>(`/api/admin/promos/${id}`, json("DELETE")),
    broadcasts: () => request<BroadcastsResponse>("/api/admin/broadcasts"),
    createBroadcast: (b: Partial<Broadcast>) => request<Broadcast>("/api/admin/broadcasts", json("POST", b)),
    cancelBroadcast: (id: number) => request<void>(`/api/admin/broadcasts/${id}`, json("DELETE")),
    stats: (period: string) => request<Stats>(`/api/admin/stats?period=${period}`),
  },
};
