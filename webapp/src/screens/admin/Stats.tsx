import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import { Segmented, Skeleton } from "../../components/ui";
import { api } from "../../lib/api";
import { rub } from "../../lib/format";
import type { Stats } from "../../lib/types";

const PERIODS = [
  { id: "day", title: "День" },
  { id: "week", title: "Неделя" },
  { id: "month", title: "Месяц" },
];

export function AdminStats() {
  const [period, setPeriod] = useState("day");
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    setStats(null);
    api.admin.stats(period).then(setStats).catch(() => undefined);
  }, [period]);

  const max = Math.max(1, ...(stats?.series.map((s) => s.value) ?? [1]));
  const topMax = Math.max(1, ...(stats?.top.map((t) => t.qty) ?? [1]));
  const n = stats?.series.length ?? 0;
  const step = n > 25 ? 5 : n > 12 ? 4 : n > 8 ? 2 : 1;

  return (
    <>
      <div style={{ marginBottom: 14 }}>
        <Segmented items={PERIODS.map((p) => ({ id: p.id, title: p.title }))} active={period} onChange={setPeriod} />
      </div>

      {!stats ? (
        <Skeleton h={320} />
      ) : (
        <>
          <div className="kpis">
            <div className="card kpi">
              <span className="muted small">Выручка</span>
              <b>{rub(stats.revenue)}</b>
            </div>
            <div className="card kpi">
              <span className="muted small">Заказы</span>
              <b>{stats.orders}</b>
            </div>
            <div className="card kpi">
              <span className="muted small">Средний чек</span>
              <b>{rub(stats.avg_check)}</b>
            </div>
            <div className="card kpi">
              <span className="muted small">Новые гости</span>
              <b>{stats.new_users}</b>
            </div>
          </div>

          <div className="card section" style={{ padding: 14 }}>
            <h3>Выручка {period === "day" ? "по часам" : "по дням"}</h3>
            <div className="bars">
              {stats.series.map((s, i) => (
                <div className="bars__col" key={s.label} title={`${s.label}: ${rub(s.value)}`}>
                  <motion.div className="bars__bar" style={{ height: `${(s.value / max) * 100}%`, transformOrigin: "bottom" }} initial={{ scaleY: 0 }} animate={{ scaleY: 1 }} transition={{ type: "spring", stiffness: 300, damping: 30, delay: Math.min(i, 8) * 0.03 }} />
                  <span className="bars__label">{i % step === 0 ? s.label : " "}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="card section" style={{ padding: 14 }}>
            <h3 style={{ marginBottom: 10 }}>Топ-5 позиций</h3>
            {stats.top.length === 0 && <div className="muted small">Пока нет продаж за период</div>}
            {stats.top.map((t, i) => (
              <div key={t.product_id} style={{ marginBottom: 10 }}>
                <div className="row row--between small">
                  <span>
                    <b>{i + 1}.</b> {t.name}
                  </span>
                  <span className="num">{t.qty} шт.</span>
                </div>
                <div className="coffee-bar" style={{ height: 8, marginTop: 4 }}>
                  <motion.div className="coffee-bar__fill" initial={{ scaleX: 0 }} animate={{ scaleX: t.qty / topMax }} transition={{ type: "spring", stiffness: 300, damping: 30 }} />
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </>
  );
}
