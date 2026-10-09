import { useEffect, useState } from "react";
import { Skeleton } from "../../components/ui";
import { api } from "../../lib/api";
import { tg } from "../../lib/tg";
import type { Promo } from "../../lib/types";
import { useApp } from "../../store";

export function AdminPromos() {
  const [list, setList] = useState<Promo[] | null>(null);
  const [form, setForm] = useState({ code: "", type: "percent" as Promo["type"], value: "10", expires: "", limit: "" });
  const showToast = useApp((s) => s.showToast);

  const load = () => api.admin.promos().then(setList).catch(() => undefined);
  useEffect(() => {
    load();
  }, []);

  const create = async () => {
    try {
      await api.admin.createPromo({
        code: form.code.trim().toUpperCase(),
        type: form.type,
        value: Number(form.value),
        expires_at: form.expires ? new Date(form.expires + "T23:59:59").toISOString() : null,
        usage_limit: form.limit ? Number(form.limit) : null,
      });
      tg.notify("success");
      setForm({ ...form, code: "" });
      load();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Ошибка", "error");
    }
  };

  const expire = async (p: Promo) => {
    await api.admin.expirePromo(p.id);
    load();
  };

  const isActive = (p: Promo) => (!p.expires_at || new Date(p.expires_at) > new Date()) && (p.usage_limit === null || p.used_count < p.usage_limit);

  return (
    <>
      <div className="card" style={{ padding: 14 }}>
        <h3 style={{ marginBottom: 10 }}>Новый промокод</h3>
        <label className="field">
          <span>Код</span>
          <input className="input" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, "") })} placeholder="AUTUMN20" />
        </label>
        <div className="row">
          <label className="field grow">
            <span>Скидка</span>
            <input className="input num" inputMode="numeric" value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value.replace(/\D/g, "") })} />
          </label>
          <label className="field" style={{ width: 110 }}>
            <span>Тип</span>
            <select className="input" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as Promo["type"] })}>
              <option value="percent">%</option>
              <option value="fixed">₽</option>
            </select>
          </label>
        </div>
        <div className="row">
          <label className="field grow">
            <span>Действует до</span>
            <input className="input" type="date" value={form.expires} onChange={(e) => setForm({ ...form, expires: e.target.value })} />
          </label>
          <label className="field grow">
            <span>Лимит использований</span>
            <input className="input num" inputMode="numeric" placeholder="∞" value={form.limit} onChange={(e) => setForm({ ...form, limit: e.target.value.replace(/\D/g, "") })} />
          </label>
        </div>
        <button className="btn btn--block" disabled={form.code.length < 3 || !Number(form.value)} onClick={create}>
          Создать
        </button>
      </div>

      <div className="section stack">
        {!list && <Skeleton h={120} />}
        {list?.map((p) => (
          <div key={p.id} className={`card list-row ${isActive(p) ? "" : "dim"}`} style={{ padding: 14 }}>
            <div className="grow">
              <b className="num">{p.code}</b>
              <div className="muted small">
                −{p.value}
                {p.type === "percent" ? "%" : " ₽"} · использован {p.used_count}
                {p.usage_limit ? ` из ${p.usage_limit}` : ""}
                {p.expires_at ? ` · до ${new Date(p.expires_at).toLocaleDateString("ru-RU")}` : ""}
              </div>
            </div>
            {isActive(p) && (
              <button className="btn btn--sm btn--quiet" onClick={() => expire(p)}>
                Завершить
              </button>
            )}
          </div>
        ))}
      </div>
    </>
  );
}
