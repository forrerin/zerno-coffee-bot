import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import { lite, spring } from "../lib/motion";
import { tg } from "../lib/tg";
import { CoffeeProgress, MainButton } from "../components/ui";
import { api } from "../lib/api";
import { rub, time } from "../lib/format";
import type { Order } from "../lib/types";
import { useApp } from "../store";

/** Чашка наполняется кофе снизу вверх, затем пар и латте-арт сердечко (~2 с). */
function FillingCup() {
  const ease = [0.4, 0, 0.2, 1] as const;
  return (
    <svg viewBox="0 0 200 200" width="210" height="210" aria-hidden>
      <defs>
        <clipPath id="cup-inside">
          <path d="M52 78h96l-8 74a18 18 0 0 1-18 16H78a18 18 0 0 1-18-16l-8-74Z" />
        </clipPath>
        <linearGradient id="coffee-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#a86b43" />
          <stop offset="1" stopColor="#5a321c" />
        </linearGradient>
      </defs>
      <ellipse cx="102" cy="182" rx="70" ry="9" fill="rgba(40,22,10,.18)" />
      <ellipse cx="100" cy="174" rx="78" ry="12" fill="var(--glass-solid)" stroke="rgba(70,45,28,.18)" />

      <g clipPath="url(#cup-inside)">
        <motion.rect
          x="40"
          width="120"
          height="110"
          fill="url(#coffee-grad)"
          initial={{ y: 170 }}
          animate={{ y: 84 }}
          transition={{ duration: 1.2, ease }}
        />
        <motion.path
          d="M40 0c10-5 20 5 30 0s20 5 30 0 20 5 30 0 20 5 30 0v10H40Z"
          fill="#f2dcc0"
          initial={{ y: 170, opacity: 0 }}
          animate={{ y: [170, 84, 82], opacity: [0, 0, 1], x: [0, -10, 0] }}
          transition={{ duration: 1.4, ease, times: [0, 0.85, 1] }}
        />
      </g>
      <path d="M52 78h96l-8 74a18 18 0 0 1-18 16H78a18 18 0 0 1-18-16l-8-74Z" fill="none" stroke="var(--text)" strokeWidth="4" strokeLinejoin="round" />
      <path d="M146 96h10a16 16 0 0 1 0 32h-14" fill="none" stroke="var(--text)" strokeWidth="4" strokeLinecap="round" />

      <motion.path
        d="M100 112c-10-7-15-11-15-17a7.5 7.5 0 0 1 15-2.5 7.5 7.5 0 0 1 15 2.5c0 6-5 10-15 17Z"
        fill="#a86b43"
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        style={{ transformOrigin: "100px 100px" }}
        transition={{ delay: 1.45, type: "spring", stiffness: 260, damping: 14 }}
      />

      {[78, 100, 122].map((x, i) => (
        <motion.path
          key={x}
          d={`M${x} 64c-8-8 8-14 0-22s8-14 0-22`}
          fill="none"
          stroke="var(--text-2)"
          strokeWidth="3.5"
          strokeLinecap="round"
          initial={{ pathLength: 0, opacity: 0 }}
          animate={{ pathLength: 1, opacity: [0, 0.8, 0.5], y: [6, 0, -4] }}
          transition={{ delay: 1.2 + i * 0.15, duration: 0.8 }}
        />
      ))}
    </svg>
  );
}

/** Номер заказа «набирается» посимвольно */
function TypedNumber({ value }: { value: string }) {
  const [shown, setShown] = useState(0);
  useEffect(() => {
    if (!value) return;
    setShown(0);
    let i = 0;
    const t = window.setInterval(() => {
      i += 1;
      setShown(i);
      if (i >= value.length) window.clearInterval(t);
    }, 110);
    return () => window.clearInterval(t);
  }, [value]);
  if (!value) return <span className="muted">…</span>;
  return (
    <span className="num">
      {value.split("").map((ch, i) => (
        <motion.span
          key={i}
          style={{ display: "inline-block" }}
          initial={false}
          animate={i < shown ? { opacity: 1, y: 0 } : { opacity: 0, y: 10 }}
          transition={spring.bouncy}
        >
          {ch}
        </motion.span>
      ))}
    </span>
  );
}

/** Сдержанное «конфетти» из кофейных зёрен из чашки (≈1 с, один раз) */
function BeanBurst() {
  const beans = Array.from({ length: 14 }, (_, i) => {
    const angle = (-160 + (i * 140) / 13) * (Math.PI / 180);
    const dist = 90 + ((i * 37) % 60);
    return { i, x: Math.cos(angle) * dist, y: Math.sin(angle) * dist - 20, r: (i * 53) % 360, s: 0.7 + ((i * 17) % 5) / 10 };
  });
  return (
    <div className="bean-burst" aria-hidden>
      {beans.map((b) => (
        <motion.svg
          key={b.i}
          viewBox="0 0 20 28"
          width={12 * b.s}
          height={17 * b.s}
          initial={{ x: 0, y: 30, opacity: 0, rotate: 0, scale: 0.4 }}
          animate={{ x: b.x, y: [30, b.y, b.y + 120], opacity: [0, 1, 0], rotate: b.r + 180, scale: 1 }}
          transition={{ delay: 1.25 + (b.i % 4) * 0.03, duration: 1.1, ease: [0.2, 0, 0, 1], times: [0, 0.35, 1] }}
        >
          <ellipse cx="10" cy="14" rx="8.5" ry="12.5" fill="#6f4428" />
          <path d="M10 2.5c-4 4 4 8 0 23" stroke="#3b2214" strokeWidth="1.6" fill="none" strokeLinecap="round" />
        </motion.svg>
      ))}
    </div>
  );
}

export function Success({ orderId }: { orderId: number }) {
  const [order, setOrder] = useState<Order | null>(null);
  const reset = useApp((s) => s.reset);

  // haptic «успех» — в момент, когда чашка наполнилась и появилось сердечко
  useEffect(() => {
    const t = window.setTimeout(() => tg.notify("success"), 1400);
    return () => window.clearTimeout(t);
  }, []);

  useEffect(() => {
    let alive = true;
    const load = () => api.order(orderId).then((o) => alive && setOrder(o)).catch(() => undefined);
    load();
    const t = setInterval(() => document.visibilityState === "visible" && load(), 20_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [orderId]);

  return (
    <div className="screen screen--plain" style={{ textAlign: "center", paddingTop: 40 }}>
      <div className="success-hero">
        <FillingCup />
        {!lite && <BeanBurst />}
      </div>
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.7, duration: 0.3 }}>
        <div className="muted">Оплата прошла</div>
        <h1 style={{ fontSize: 30, margin: "6px 0" }}>
          Заказ №<TypedNumber value={order?.number ?? ""} />
        </h1>
        <p className="muted" style={{ margin: "0 0 20px" }}>
          {order?.ready_at ? `Приготовим к ${time(order.ready_at)}` : "Уже готовим — пришлём уведомление в Telegram, когда будет готово"}
        </p>
        {order && (
          <div className="card" style={{ padding: 16, textAlign: "left" }}>
            <div className="row row--between" style={{ marginBottom: 12 }}>
              <b>{order.status_title}</b>
              <span className="price">{rub(order.total)}</span>
            </div>
            <CoffeeProgress status={order.status} />
            <div className="muted small" style={{ marginTop: 12 }}>
              {order.items.map((i) => `${i.name}${i.size ? " " + i.size : ""} × ${i.qty}`).join(", ")}
            </div>
          </div>
        )}
      </motion.div>
      <MainButton text="Отлично!" onClick={() => reset("home")} />
    </div>
  );
}
