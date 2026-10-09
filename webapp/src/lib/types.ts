export type Badge = "hit" | "new" | "decaf";
export type ModGroup = "milk" | "syrup" | "extra";
export type SizeCode = "S" | "M" | "L";
export type OrderStatus = "new" | "paid" | "preparing" | "ready" | "completed" | "cancelled";

export interface Category {
  id: number;
  name: string;
  icon: string;
  sort: number;
}

export interface Size {
  size: SizeCode;
  volume_ml: number;
  price: number;
}

export interface Product {
  id: number;
  category_id: number;
  name: string;
  description: string;
  photo_url: string;
  base_price: number;
  badges: Badge[];
  modifier_groups: ModGroup[];
  tags: string;
  is_active: boolean;
  sizes: Size[];
}

export interface Modifier {
  id: number;
  group: ModGroup;
  name: string;
  price: number;
  is_active: boolean;
}

export interface MenuData {
  categories: Category[];
  products: Product[];
  modifiers: Modifier[];
}

export interface User {
  id: number;
  tg_id: number;
  name: string;
  username: string | null;
  birthday: string | null;
  bonus_count: number;
  notifications_on: boolean;
  is_admin: boolean;
}

export interface CartLine {
  key: string;
  product_id: number;
  size: SizeCode | null;
  modifier_ids: number[];
  qty: number;
}

export interface OrderItem {
  product_id: number;
  name: string;
  size: SizeCode | null;
  modifiers: { id: number; name: string; price: number; group: ModGroup }[];
  qty: number;
  price: number;
}

export interface Order {
  id: number;
  number: string;
  status: OrderStatus;
  status_title: string;
  subtotal: number;
  discount: number;
  total: number;
  bonus_used: boolean;
  ready_at: string | null;
  comment: string;
  payment_method: "card" | "stars" | null;
  paid_at: string | null;
  status_changed_at: string;
  created_at: string;
  items: OrderItem[];
  user?: { name: string; username: string | null; tg_id: number };
}

export interface Quote {
  subtotal: number;
  bonus_discount: number;
  promo_discount: number;
  discount: number;
  total: number;
  promo_code: string | null;
  promo_error: string | null;
}

export interface Banner {
  id: number;
  title: string;
  text: string;
  art: string;
  tone: "caramel" | "pistachio" | "cocoa";
}

export interface PreviousItem {
  product_id: number;
  size: SizeCode | null;
  modifier_ids: number[];
  modifiers: { name: string }[];
  name: string;
  price: number;
}

export interface HomeData {
  banners: Banner[];
  hit_of_day: number | null;
  previous: PreviousItem[];
  active_order: Order | null;
}

export interface Promo {
  id: number;
  code: string;
  type: "percent" | "fixed";
  value: number;
  expires_at: string | null;
  usage_limit: number | null;
  used_count: number;
}

export interface Broadcast {
  id: number;
  text: string;
  photo: string | null;
  button_text: string | null;
  button_url: string | null;
  segment: "all" | "sleeping" | "regular";
  scheduled_at: string | null;
  sent_count: number;
  failed_count: number;
  total_count: number;
  status: "scheduled" | "sending" | "done" | "failed" | "cancelled";
  created_at: string;
}

export interface BroadcastsResponse {
  items: Broadcast[];
  segments: { id: Broadcast["segment"]; title: string; count: number }[];
}

export interface Stats {
  period: string;
  orders: number;
  revenue: number;
  avg_check: number;
  new_users: number;
  top: { product_id: number; name: string; qty: number }[];
  series: { label: string; value: number }[];
}
