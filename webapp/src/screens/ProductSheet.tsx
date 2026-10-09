import { motion } from "framer-motion";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Art } from "../components/Art";
import { AnimatedPrice, Badges, DrawCheck, MainButton, Qty, Segmented, Sheet } from "../components/ui";
import { dur, lite, spring } from "../lib/motion";
import { indexMenu, rub, unitPrice } from "../lib/format";
import { tg } from "../lib/tg";
import type { Modifier, ModGroup, Product, SizeCode } from "../lib/types";
import { useApp } from "../store";

type Rect = { x: number; y: number; w: number; h: number };

const GROUP_TITLES: Record<ModGroup, string> = { milk: "Молоко", syrup: "Сиропы", extra: "Добавки" };

function Options({ product, onAdd }: { product: Product; onAdd: () => void }) {
  const menu = useApp((s) => s.menu);
  const addToCart = useApp((s) => s.addToCart);
  const { modifiers } = indexMenu(menu);
  const heroRef = useRef<HTMLDivElement>(null);

  const defaultSize = (product.sizes.find((s) => s.size === "M") ?? product.sizes[0])?.size ?? null;
  const groups = product.modifier_groups;
  const byGroup = (g: ModGroup) => (menu?.modifiers ?? []).filter((m) => m.group === g);
  const defaultMilk = groups.includes("milk") ? byGroup("milk").find((m) => m.price === 0)?.id : undefined;

  const [size, setSize] = useState<SizeCode | null>(defaultSize);
  const [mods, setMods] = useState<number[]>(defaultMilk ? [defaultMilk] : []);
  const [qty, setQty] = useState(1);

  const unit = unitPrice(product, size, mods, modifiers);
  // объём заметен на иллюстрации: S меньше, L больше
  const sizeScale = size === "S" ? 0.86 : size === "L" ? 1.12 : 1;

  // перелёт фото из карточки, откуда открыли шторку
  const [flight, setFlight] = useState<{ from: Rect; to: Rect } | null>(null);
  const [landed, setLanded] = useState(false);
  // фиксируем при открытии: store-значение очищается сразу после замера
  const [flying] = useState(() => !!useApp.getState().sheetOrigin && !lite);
  useLayoutEffect(() => {
    const origin = useApp.getState().sheetOrigin;
    useApp.setState({ sheetOrigin: null });
    const hero = heroRef.current;
    const art = hero?.querySelector<HTMLElement>(".hero-art");
    const sheet = hero?.closest<HTMLElement>(".sheet");
    if (!origin || lite || !art || !sheet) {
      setLanded(true); // перелёт невозможен — просто показываем фото
      return;
    }
    // где окажется фото, когда шторка доедет до места
    const shift = window.innerHeight - sheet.offsetHeight - sheet.getBoundingClientRect().top;
    const r = art.getBoundingClientRect();
    setFlight({ from: origin, to: { x: r.left, y: r.top + shift, w: r.width, h: r.height } });
  }, []);

  const toggle = (m: Modifier) => {
    tg.select();
    if (m.group === "milk") {
      setMods((cur) => [...cur.filter((id) => modifiers.get(id)?.group !== "milk"), m.id]);
    } else {
      setMods((cur) => (cur.includes(m.id) ? cur.filter((id) => id !== m.id) : [...cur, m.id]));
    }
  };

  const add = () => {
    const r = heroRef.current?.getBoundingClientRect();
    tg.haptic("light"); // сильный отклик — при приземлении в корзину
    // «Обычное» молоко бесплатное и по умолчанию — не храним его, чтобы одинаковые позиции склеивались
    const ids = mods.filter((id) => !(id === defaultMilk));
    addToCart({ product_id: product.id, size, modifier_ids: ids, qty }, r ? { x: r.x + r.width / 2, y: r.y + r.height / 2 } : undefined, product.photo_url);
    onAdd();
  };

  return (
    <>
      <div ref={heroRef} className="sheet__hero">
        <motion.div
          className="hero-art"
          initial={flying ? false : { scale: 0.8, rotate: -8, opacity: 0 }}
          animate={{ scale: sizeScale, rotate: 0, opacity: flying && !landed ? 0 : 1 }}
          transition={{ scale: spring.bouncy, rotate: spring.smooth, opacity: { duration: landed ? 0 : dur.short } }}
        >
          {/* при выборе добавки иллюстрация коротко «откликается» */}
          <motion.div key={mods.join(",")} initial={{ scale: 1.06, rotate: -3 }} animate={{ scale: 1, rotate: 0 }} transition={spring.bouncy} style={{ width: "100%", height: "100%" }}>
            <Art src={product.photo_url} />
          </motion.div>
        </motion.div>
      </div>
      {flight &&
        !landed &&
        createPortal(
          // перелёт фото из карточки в шапку шторки (FLIP: стоим в конечной точке, стартуем со смещения)
          <motion.div
            className="fly-hero"
            style={{ left: flight.to.x, top: flight.to.y, width: flight.to.w, height: flight.to.h }}
            initial={{ x: flight.from.x - flight.to.x, y: flight.from.y - flight.to.y, scale: flight.from.w / flight.to.w }}
            animate={{ x: 0, y: 0, scale: 1 }}
            transition={spring.smooth}
            onAnimationComplete={() => setLanded(true)}
          >
            <Art src={product.photo_url} />
          </motion.div>,
          document.body,
        )}

      <Badges badges={product.badges} />
      <h1 style={{ marginTop: 8 }}>{product.name}</h1>
      <p className="muted" style={{ margin: "6px 0 18px" }}>
        {product.description}
      </p>

      {product.sizes.length > 1 && (
        <div className="section" style={{ marginTop: 0 }}>
          <h3 style={{ marginBottom: 10 }}>Объём</h3>
          <Segmented
            items={product.sizes.map((s) => ({ id: s.size, title: s.size, sub: `${s.volume_ml} мл · ${rub(s.price)}` }))}
            active={size}
            onChange={(v) => setSize(v)}
          />
        </div>
      )}

      {groups.map((g) => {
        const list = byGroup(g);
        if (!list.length) return null;
        const single = g === "milk";
        return (
          <div className="section" key={g}>
            <h3 style={{ marginBottom: 10 }}>
              {GROUP_TITLES[g]} <span className="muted small">{single ? "— одно на выбор" : "— можно несколько"}</span>
            </h3>
            <div className="mods">
              {list.map((m) => {
                const on = mods.includes(m.id);
                return (
                  <motion.button
                    key={m.id}
                    className={`mod-chip ${on ? "mod-chip--on" : ""}`}
                    aria-pressed={on}
                    onClick={() => toggle(m)}
                    animate={{ scale: on ? [1, 1.06, 1] : 1 }}
                    transition={spring.bouncy}
                  >
                    {on && <DrawCheck />}
                    <span>{m.name}</span>
                    <small>{m.price ? `+${m.price} ₽` : "бесплатно"}</small>
                  </motion.button>
                );
              })}
            </div>
          </div>
        );
      })}

      <div className="section row row--between">
        <h3>Количество</h3>
        <Qty value={qty} onChange={setQty} />
      </div>

      <div className="card sheet__total">
        <span className="muted">Итого</span>
        <AnimatedPrice value={unit * qty} />
      </div>

      <MainButton text={`Добавить · ${rub(unit * qty)}`} onClick={add} />
    </>
  );
}

export function ProductSheet() {
  const id = useApp((s) => s.sheetProductId);
  const menu = useApp((s) => s.menu);
  const close = () => useApp.setState({ sheetProductId: null });
  const product = menu?.products.find((p) => p.id === id);

  // открыть из бота: ?product=ID
  useEffect(() => {
    const fromBot = Number(tg.startParam("product"));
    if (fromBot && menu) {
      tg.clearStartParams();
      useApp.setState({ sheetProductId: fromBot });
    }
  }, [menu]);

  return (
    <Sheet open={!!product} onClose={close}>
      {product && <Options key={product.id} product={product} onAdd={close} />}
    </Sheet>
  );
}
