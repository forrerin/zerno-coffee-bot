import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useState } from "react";
import { PillTabs, Skeleton, StatusPill } from "../../components/ui";
import { api } from "../../lib/api";
import { dateTime, rub, time } from "../../lib/format";
import { tg } from "../../lib/tg";
import type { Order, OrderStatus } from "../../lib/types";
import { useApp } from "../../store";

const FILTERS: { id: string; title: string }[] = [
  { id: "active", title: "В работе" },
  { id: "", title: "Все" },
  { id: "ready", title: "Готовы" },
  { id: "completed", title: "Выданы" },
  { id: "cancelled", title: "Отменены" },
];

const NEXT: Partial<Record<OrderStatus, { status: OrderStatus; title: string }>> = {
  paid: { status: "preparing", title: "🔥 Готовится" },
  preparing: { status: "ready", title: "✅ Готов" },
  ready: { status: "completed", title: "📦 Выдан" },
};

export function AdminOrders() {
  const [filter, setFilter] = useState("active");
  const [orders, setOrders] = useState<Order[] | null>(null);
  const showToast = useApp((s) => s.showToast);

  const load = useCallback(() => api.admin.orders(filter).then(setOrders).catch(() => undefined), [filter]);

  useEffect(() => {
    setOrders(null);
    load();
    const t = setInterval(() => document.visibilityState === "visible" && load(), 10_000); // лента в реальном времени
    return () => clearInterval(t);
  }, [load]);

  // статус меняется на экране сразу, запрос — в фоне; при ошибке список перечитывается
  const change = async (o: Order, status: OrderStatus) => {
    tg.haptic("medium");
    const titles: Partial<Record<OrderStatus, string>> = { preparing: "Готовится", ready: "Готов", completed: "Выдан", cancelled: "Отменён" };
    setOrders((list) => list?.map((x) => (x.id === o.id ? { ...x, status, status_title: titles[status] ?? x.status_title } : x)) ?? null);
    try {
      const updated = await api.admin.setStatus(o.id, status);
      setOrders((list) => list?.map((x) => (x.id === o.id ? updated : x)) ?? null);
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Ошибка", "error");
      load();
    }
  };

  return (
    <>
      <div style={{ marginBottom: 12 }}>
        <PillTabs items={FILTERS.map((f) => ({ id: f.id, title: f.title }))} active={filter} onChange={setFilter} />
      </div>

      {!orders && <Skeleton h={160} />}
      {orders?.length === 0 && <p className="muted" style={{ textAlign: "center" }}>Заказов нет ☕</p>}

      <div className="stack">
        <AnimatePresence initial={false}>
          {orders?.map((o) => {
            const next = NEXT[o.status];
            return (
              <motion.div key={o.id} layout className="card admin-order" initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}>
                <div className="row row--between">
                  <div>
                    <h3>№{o.number}</h3>
                    <div className="muted small">
                      {o.user?.name}
                      {o.user?.username ? ` · @${o.user.username}` : ""} · {dateTime(o.created_at)}
                    </div>
                  </div>
                  <StatusPill status={o.status} title={o.status_title} />
                </div>
                <div className="small" style={{ margin: "10px 0" }}>
                  {o.items.map((it, k) => (
                    <div key={k}>
                      <b>
                        {it.name} {it.size}
                      </b>{" "}
                      × {it.qty}
                      {it.modifiers.length > 0 && <span className="muted"> — {it.modifiers.map((m) => m.name).join(", ")}</span>}
                    </div>
                  ))}
                  {o.comment && <div style={{ marginTop: 6 }}>💬 {o.comment}</div>}
                </div>
                <div className="row row--between">
                  <div className="small">
                    <span className="price">{rub(o.total)}</span>
                    <span className="muted"> · {o.ready_at ? `к ${time(o.ready_at)}` : "скорее"}</span>
                  </div>
                  <div className="row">
                    {next && (
                      <button className="btn btn--sm" onClick={() => change(o, next.status)}>
                        {next.title}
                      </button>
                    )}
                    {["paid", "preparing"].includes(o.status) && (
                      <button className="btn btn--sm btn--danger" onClick={() => change(o, "cancelled")} aria-label="Отменить">
                        ✕
                      </button>
                    )}
                  </div>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </>
  );
}
