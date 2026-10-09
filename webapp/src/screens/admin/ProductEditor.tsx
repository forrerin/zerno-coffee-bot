import { useEffect, useRef, useState } from "react";
import { Art, ART_KEYS } from "../../components/Art";
import { Icon } from "../../components/Icon";
import { MainButton, Skeleton, TopBar } from "../../components/ui";
import { api } from "../../lib/api";
import { tg } from "../../lib/tg";
import type { Badge, ModGroup, Product, Size, SizeCode } from "../../lib/types";
import { useApp } from "../../store";

const SIZE_DEFAULTS: Record<SizeCode, number> = { S: 250, M: 350, L: 450 };
const BADGES: [Badge, string][] = [
  ["hit", "Хит"],
  ["new", "Новинка"],
  ["decaf", "Без кофеина"],
];
const GROUPS: [ModGroup, string][] = [
  ["milk", "Молоко"],
  ["syrup", "Сиропы"],
  ["extra", "Добавки"],
];

type Draft = Omit<Product, "id"> & { id?: number };

function Check({ on, label, onClick }: { on: boolean; label: string; onClick: () => void }) {
  return (
    <button className={`opt ${on ? "opt--on" : ""}`} onClick={() => (tg.select(), onClick())} style={{ padding: "10px 12px" }}>
      <span className="opt__mark opt__mark--box">{on && <Icon name="check" size={14} stroke={3} />}</span>
      <span className="small" style={{ fontWeight: 600 }}>
        {label}
      </span>
    </button>
  );
}

export function ProductEditor({ id }: { id: number | null }) {
  const menu = useApp((s) => s.menu);
  const back = useApp((s) => s.back);
  const showToast = useApp((s) => s.showToast);
  const fileRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (id === null) {
      setDraft({
        category_id: menu?.categories[0]?.id ?? 1,
        name: "",
        description: "",
        photo_url: "art:cappuccino",
        base_price: 200,
        badges: [],
        modifier_groups: ["milk", "syrup", "extra"],
        tags: "",
        is_active: true,
        sizes: [
          { size: "S", volume_ml: 250, price: 200 },
          { size: "M", volume_ml: 350, price: 240 },
        ],
      });
      return;
    }
    api.admin.menu().then((d) => {
      const p = d.products.find((x) => x.id === id);
      if (p) setDraft(p);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (!draft) return <div className="screen screen--plain"><Skeleton h={400} /></div>;

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => d && { ...d, [k]: v });
  const toggleIn = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  const sizeOf = (code: SizeCode) => draft.sizes.find((s) => s.size === code);
  const toggleSize = (code: SizeCode) => {
    const has = sizeOf(code);
    const sizes: Size[] = has
      ? draft.sizes.filter((s) => s.size !== code)
      : [...draft.sizes, { size: code, volume_ml: SIZE_DEFAULTS[code], price: draft.base_price }].sort((a, b) => "SML".indexOf(a.size) - "SML".indexOf(b.size));
    set("sizes", sizes);
  };
  const editSize = (code: SizeCode, patch: Partial<Size>) => set("sizes", draft.sizes.map((s) => (s.size === code ? { ...s, ...patch } : s)));

  const upload = async (file: File) => {
    setUploading(true);
    try {
      const { url } = await api.admin.upload(file);
      set("photo_url", url);
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Не загрузилось", "error");
    } finally {
      setUploading(false);
    }
  };

  const save = async () => {
    if (!draft.name.trim()) return showToast("Укажите название", "error");
    setSaving(true);
    try {
      const base = draft.sizes.length ? Math.min(...draft.sizes.map((s) => s.price)) : draft.base_price;
      await api.admin.saveProduct({ ...draft, base_price: base });
      useApp.setState({ menu: await api.menu() });
      tg.notify("success");
      showToast("Сохранено");
      back();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Ошибка", "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="screen screen--plain">
      <TopBar back title={id ? "Редактирование" : "Новая позиция"} right={<span />} />

      <div className="card" style={{ padding: 14 }}>
        <div className="row">
          <div className="thumb" style={{ width: 96, height: 96 }}>
            <Art src={draft.photo_url} />
          </div>
          <div className="grow stack" style={{ gap: 8 }}>
            <button className="btn btn--ghost btn--sm" onClick={() => fileRef.current?.click()} disabled={uploading}>
              <Icon name="image" size={18} /> {uploading ? "Загрузка…" : "Загрузить фото"}
            </button>
            <div className="muted small">PNG на прозрачном фоне, до 5 МБ — или выберите иллюстрацию ниже</div>
          </div>
        </div>
        <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
        <div className="hscroll" style={{ marginTop: 12 }}>
          {ART_KEYS.map((k) => (
            <button key={k} className="thumb" style={{ outline: draft.photo_url === `art:${k}` ? "2px solid var(--accent)" : "none" }} onClick={() => set("photo_url", `art:${k}`)}>
              <Art src={`art:${k}`} />
            </button>
          ))}
        </div>
      </div>

      <div className="section">
        <label className="field">
          <span>Название</span>
          <input className="input" value={draft.name} onChange={(e) => set("name", e.target.value)} maxLength={128} />
        </label>
        <label className="field">
          <span>Описание</span>
          <textarea className="input" value={draft.description} onChange={(e) => set("description", e.target.value)} rows={3} />
        </label>
        <label className="field">
          <span>Категория</span>
          <select className="input" value={draft.category_id} onChange={(e) => set("category_id", Number(e.target.value))}>
            {menu?.categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Теги для AI-бариста</span>
          <input className="input" value={draft.tags} onChange={(e) => set("tags", e.target.value)} placeholder="холодный бодрящий не сладкий" />
        </label>
      </div>

      <div className="section">
        <h3 style={{ marginBottom: 8 }}>Объёмы и цены</h3>
        <div className="opts" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
          {(["S", "M", "L"] as SizeCode[]).map((c) => (
            <Check key={c} on={!!sizeOf(c)} label={c} onClick={() => toggleSize(c)} />
          ))}
        </div>
        {draft.sizes.map((s) => (
          <div key={s.size} className="row" style={{ marginTop: 8 }}>
            <b style={{ width: 24 }}>{s.size}</b>
            <input className="input num grow" inputMode="numeric" value={s.volume_ml} onChange={(e) => editSize(s.size, { volume_ml: Number(e.target.value.replace(/\D/g, "")) })} />
            <span className="muted small">мл</span>
            <input className="input num grow" inputMode="numeric" value={s.price} onChange={(e) => editSize(s.size, { price: Number(e.target.value.replace(/\D/g, "")) })} />
            <span className="muted small">₽</span>
          </div>
        ))}
        {!draft.sizes.length && (
          <label className="field" style={{ marginTop: 10 }}>
            <span>Цена, ₽</span>
            <input className="input num" inputMode="numeric" value={draft.base_price} onChange={(e) => set("base_price", Number(e.target.value.replace(/\D/g, "")))} />
          </label>
        )}
      </div>

      <div className="section">
        <h3 style={{ marginBottom: 8 }}>Бейджи</h3>
        <div className="opts" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
          {BADGES.map(([b, t]) => (
            <Check key={b} on={draft.badges.includes(b)} label={t} onClick={() => set("badges", toggleIn(draft.badges, b))} />
          ))}
        </div>
      </div>

      <div className="section">
        <h3 style={{ marginBottom: 8 }}>Доступные добавки</h3>
        <div className="opts" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
          {GROUPS.map(([g, t]) => (
            <Check key={g} on={draft.modifier_groups.includes(g)} label={t} onClick={() => set("modifier_groups", toggleIn(draft.modifier_groups, g))} />
          ))}
        </div>
      </div>

      <MainButton text={id ? "Сохранить" : "Добавить в меню"} onClick={save} loading={saving} />
    </div>
  );
}
