import { motion } from "framer-motion";
import { useCallback, useEffect, useState } from "react";
import { CoffeeProgress, Empty, Price, Skeleton, StatusPill, TopBar } from "../components/ui";
import { Icon } from "../components/Icon";
import { api } from "../lib/api";
import { dateTime, linesFromOrder, time } from "../lib/format";
import { tg } from "../lib/tg";
import type { Order } from "../lib/types";
import { useApp } from "../store";

const ACTIVE = ["paid", "preparing", "ready"];

let ordersCache: Order[] | null = null;

export function Orders() {
  const [orders, setOrders] = useState<Order[] | null>(ordersCache);
  const replaceCart = useApp((s) => s.replaceCart);
  const push = useApp((s) => s.push);
  const setTab = useApp((s) => s.setTab);
  const showToast = useApp((s) => s.showToast);
  const menu = useApp((s) => s.menu);

  const load = useCallback(
    () =>
      api
        .orders()
        .then((list) => {
          ordersCache = list;
          setOrders(list);
        })
        .catch(() => undefined),
    [],
  );

  useEffect(() => {
    load();
    const t = setInterval(() => document.visibilityState === "visible" && load(), 20_000); // статусы в реальном времени — polling раз в 10 с
    return () => clearInterval(t);
  }, [load]);

  // «Повторить» — мгновенно: корзина собирается из позиций заказа на клиенте
  const repeat = (o: Order) => {
    tg.haptic("medium");
    const lines = linesFromOrder(o, menu);
    if (!lines.length) return showToast("Этих позиций больше нет в меню", "error");
    replaceCart(lines);
    push({ name: "cart" });
  };

  // отмена видна сразу, запрос — в фоне
  const cancel = (o: Order) => {
    setOrders((list) => list?.map((x) => (x.id === o.id ? { ...x, status: "cancelled", status_title: "Отменён" } : x)) ?? null);
    api.cancel(o.id).catch(() => load());
  };

  return (
    <div className="screen">
      <TopBar title="Мои заказы" />
      {!orders && (
        <div className="stack">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} h={130} />
          ))}
        </div>
      )}
      {orders && orders.length === 0 && (
        <Empty
          art="art:latte"
          title="Заказов пока нет"
          text="Первый капучино ждёт вас"
          action={
            <button className="btn" style={{ marginTop: 16 }} onClick={() => setTab("menu")}>
              Открыть меню
            </button>
          }
        />
      )}
      <div className="stack orders-grid">
        {orders?.map((o, i) => {
          const active = ACTIVE.includes(o.status);
          return (
            <motion.div key={o.id} className="card" style={{ padding: 16 }} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 6) * 0.04 }}>
              <div className="row row--between">
                <div>
                  <h3>№{o.number}</h3>
                  <div className="muted small">{dateTime(o.created_at)}</div>
                </div>
                <StatusPill status={o.status} title={o.status_title} />
              </div>
              {active && (
                <div style={{ margin: "14px 0 4px" }}>
                  <CoffeeProgress status={o.status} />
                  <div className="muted small" style={{ marginTop: 6 }}>
                    <Icon name="clock" size={14} /> {o.ready_at ? `К ${time(o.ready_at)}` : "Как можно скорее"}
                  </div>
                </div>
              )}
              <div className="small" style={{ margin: "10px 0" }}>
                {o.items.map((it, k) => (
                  <div key={k} className="row row--between">
                    <span>
                      {it.name} {it.size} {it.qty > 1 && <span className="muted">× {it.qty}</span>}
                      {it.modifiers.length > 0 && <span className="muted"> · {it.modifiers.map((m) => m.name).join(", ")}</span>}
                    </span>
                  </div>
                ))}
              </div>
              <div className="row row--between">
                <Price value={o.total} />
                <div className="row">
                  {o.status === "new" && (
                    <button className="btn btn--sm btn--quiet" onClick={() => cancel(o)}>
                      Отменить
                    </button>
                  )}
                  {o.status !== "new" && (
                    <button className="btn btn--sm btn--ghost" onClick={() => repeat(o)}>
                      <Icon name="repeat" size={16} /> Повторить
                    </button>
                  )}
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
