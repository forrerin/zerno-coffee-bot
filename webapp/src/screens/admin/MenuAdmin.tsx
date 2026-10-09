import { useEffect, useState } from "react";
import { Art } from "../../components/Art";
import { Icon } from "../../components/Icon";
import { Skeleton, Toggle } from "../../components/ui";
import { api } from "../../lib/api";
import { minPrice, rub } from "../../lib/format";
import { tg } from "../../lib/tg";
import type { Modifier, ModGroup, Product } from "../../lib/types";
import { useApp } from "../../store";

const GROUPS: Record<ModGroup, string> = { milk: "Молоко", syrup: "Сиропы", extra: "Добавки" };

function ModifierRow({ m, onSaved }: { m: Modifier; onSaved: (m: Modifier) => void }) {
  const [price, setPrice] = useState(String(m.price));
  // применяется сразу, запрос — в фоне; при ошибке — откат
  const save = async (patch: Partial<Modifier>) => {
    onSaved({ ...m, ...patch });
    try {
      onSaved(await api.admin.saveModifier({ ...m, ...patch }));
    } catch {
      onSaved(m);
      useApp.getState().showToast("Не сохранилось", "error");
    }
  };
  return (
    <div className={`list-row ${m.is_active ? "" : "dim"}`}>
      <span className="grow" style={{ fontWeight: 600 }}>
        {m.name}
      </span>
      <input
        className="input num"
        style={{ width: 84, minHeight: 38, padding: "6px 10px" }}
        inputMode="numeric"
        value={price}
        onChange={(e) => setPrice(e.target.value.replace(/\D/g, ""))}
        onBlur={() => Number(price) !== m.price && save({ price: Number(price) || 0 })}
      />
      <Toggle on={m.is_active} onChange={(v) => save({ is_active: v })} />
    </div>
  );
}

export function AdminMenu() {
  const menu = useApp((s) => s.menu);
  const push = useApp((s) => s.push);
  const [data, setData] = useState<{ products: Product[]; modifiers: Modifier[] } | null>(null);
  const [newMod, setNewMod] = useState<{ group: ModGroup; name: string; price: string }>({ group: "syrup", name: "", price: "40" });

  useEffect(() => {
    api.admin.menu().then(setData).catch(() => undefined);
  }, []);

  const refreshPublicMenu = () => api.menu().then((m) => useApp.setState({ menu: m })).catch(() => undefined);

  const toggle = async (p: Product) => {
    tg.haptic();
    const put = (v: Product) => setData((d) => d && { ...d, products: d.products.map((x) => (x.id === p.id ? v : x)) });
    put({ ...p, is_active: !p.is_active }); // сразу на экране
    try {
      put(await api.admin.toggleProduct(p.id));
      refreshPublicMenu();
    } catch {
      put(p);
      useApp.getState().showToast("Не сохранилось", "error");
    }
  };

  const onModSaved = (m: Modifier) => {
    setData((d) => d && { ...d, modifiers: d.modifiers.some((x) => x.id === m.id) ? d.modifiers.map((x) => (x.id === m.id ? m : x)) : [...d.modifiers, m] });
    refreshPublicMenu();
  };

  const addMod = async () => {
    if (!newMod.name.trim()) return;
    const m = await api.admin.saveModifier({ group: newMod.group, name: newMod.name.trim(), price: Number(newMod.price) || 0, is_active: true });
    onModSaved(m);
    setNewMod({ ...newMod, name: "" });
  };

  if (!data) return <Skeleton h={300} />;

  return (
    <>
      <button className="btn btn--block" onClick={() => push({ name: "adminProduct", id: null })}>
        <Icon name="plus" /> Новая позиция
      </button>

      {menu?.categories.map((c) => {
        const items = data.products.filter((p) => p.category_id === c.id);
        if (!items.length) return null;
        return (
          <div className="section" key={c.id}>
            <h3 style={{ marginBottom: 8 }}>{c.name}</h3>
            <div className="card" style={{ padding: 4 }}>
              {items.map((p) => (
                <div key={p.id} className={`list-row ${p.is_active ? "" : "dim"}`}>
                  <div className="thumb">
                    <Art src={p.photo_url} />
                  </div>
                  <button className="grow" style={{ textAlign: "left" }} onClick={() => push({ name: "adminProduct", id: p.id })}>
                    <b>{p.name}</b>
                    <div className="muted small">
                      {p.sizes.length ? p.sizes.map((s) => `${s.size} ${s.price}`).join(" · ") : rub(minPrice(p))}
                    </div>
                  </button>
                  <button className="icon-btn" style={{ width: 38, height: 38, boxShadow: "none" }} onClick={() => toggle(p)} aria-label={p.is_active ? "Скрыть" : "Показать"}>
                    <Icon name={p.is_active ? "eye" : "eyeOff"} size={19} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        );
      })}

      <div className="section">
        <h2 style={{ marginBottom: 10 }}>Добавки и цены</h2>
        {(Object.keys(GROUPS) as ModGroup[]).map((g) => (
          <div key={g} style={{ marginBottom: 14 }}>
            <div className="muted small" style={{ fontWeight: 700, margin: "0 0 6px 4px" }}>
              {GROUPS[g]}
            </div>
            <div className="card" style={{ padding: 4 }}>
              {data.modifiers
                .filter((m) => m.group === g)
                .map((m) => (
                  <ModifierRow key={m.id} m={m} onSaved={onModSaved} />
                ))}
            </div>
          </div>
        ))}
        <div className="card" style={{ padding: 12 }}>
          <b>Новая добавка</b>
          <div className="row" style={{ marginTop: 8 }}>
            <select className="input" style={{ width: 120 }} value={newMod.group} onChange={(e) => setNewMod({ ...newMod, group: e.target.value as ModGroup })}>
              {Object.entries(GROUPS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
            <input className="input grow" placeholder="Название" value={newMod.name} onChange={(e) => setNewMod({ ...newMod, name: e.target.value })} />
            <input className="input num" style={{ width: 70 }} inputMode="numeric" value={newMod.price} onChange={(e) => setNewMod({ ...newMod, price: e.target.value.replace(/\D/g, "") })} />
          </div>
          <button className="btn btn--ghost btn--block btn--sm" style={{ marginTop: 10 }} onClick={addMod} disabled={!newMod.name.trim()}>
            Добавить
          </button>
        </div>
      </div>
    </>
  );
}
