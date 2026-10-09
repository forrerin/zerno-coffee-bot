import { motion } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Art } from "../components/Art";
import { Icon } from "../components/Icon";
import { Badges, PillTabs, Price, Skeleton, TopBar } from "../components/ui";
import { minPrice } from "../lib/format";
import { lite, spring, stagger } from "../lib/motion";
import { onScroll as subscribeScroll, scrollToY, scrollTop } from "../lib/scroll";
import { tg } from "../lib/tg";
import type { Product } from "../lib/types";
import { useApp } from "../store";

const CAT_ICONS: Record<string, string> = { cup: "cup", ice: "ice", leaf: "leaf", donut: "donut", sun: "sun" };

function ProductCard({ p, index }: { p: Product; index: number }) {
  const openProduct = useApp((s) => s.openProduct);
  const addToCart = useApp((s) => s.addToCart);
  const base = p.sizes.length ? p.sizes.reduce((a, b) => (b.price < a.price ? b : a)) : null;

  // «+» — заказ в один тап: стандартные опции (меньший объём, без добавок), цена совпадает с «от …»
  const quickAdd = (e: React.MouseEvent) => {
    e.stopPropagation();
    tg.haptic("light"); // сильный отклик — при приземлении в корзину
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    addToCart({ product_id: p.id, size: base?.size ?? null, modifier_ids: [], qty: 1 }, { x: r.x + r.width / 2, y: r.y + r.height / 2 }, p.photo_url);
  };

  return (
    <motion.div
      className="card pcard"
      role="button"
      tabIndex={0}
      // карточка проявляется, когда въезжает во вьюпорт (один раз); в ряду — лёгкий каскад
      initial={lite ? false : { opacity: 0, y: 18, scale: 0.98 }}
      whileInView={{ opacity: 1, y: 0, scale: 1 }}
      // IntersectionObserver с корнем-вьюпортом учитывает обрезку контейнером прокрутки
      viewport={{ once: true, amount: 0.15 }}
      transition={{ ...spring.smooth, delay: stagger(index % 2) }}
      onClick={(e) => {
        tg.haptic();
        const art = (e.currentTarget as HTMLElement).querySelector(".pcard__art svg, .pcard__art img");
        const r = art?.getBoundingClientRect();
        openProduct(p.id, r ? { x: r.left, y: r.top, w: r.width, h: r.height } : null);
      }}
    >
      <div className="pcard__art">
        <Art src={p.photo_url} />
        <Badges badges={p.badges} />
      </div>
      <div className="pcard__name">{p.name}</div>
      <div className="pcard__meta">{p.description}</div>
      <div className="pcard__foot">
        <span>
          {p.sizes.length > 1 && <span className="muted small">от </span>}
          <Price value={minPrice(p)} />
        </span>
        <button className="plus" aria-label={`Добавить ${p.name}`} onClick={quickAdd}>
          <Icon name="plus" size={20} stroke={2.4} />
        </button>
      </div>
    </motion.div>
  );
}

const CHIPS_OFFSET = 70; // высота панели категорий сверху

/** Держит активный чипс в видимой части ленты (без плавной анимации — она дрожит на iOS) */
function revealChip(box: HTMLDivElement | null, id: number | null) {
  const chip = box?.querySelector<HTMLElement>(`[data-tab="${id}"]`);
  if (!box || !chip) return;
  const left = chip.offsetLeft;
  const right = left + chip.offsetWidth;
  if (left < box.scrollLeft || right > box.scrollLeft + box.clientWidth) {
    box.scrollLeft = left - (box.clientWidth - chip.offsetWidth) / 2;
  }
}

export function Menu() {
  const menu = useApp((s) => s.menu);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState<number | null>(null);
  // Панель категорий не sticky: sticky внутри прокручиваемого контейнера на iPhone
  // прыгает на 1–2px каждый кадр. Вместо этого — отдельная fixed-панель, которая
  // показывается, когда обычная лента уехала за верх экрана.
  const [pinned, setPinned] = useState(false);
  const inlineRef = useRef<HTMLDivElement>(null);
  const fixedRef = useRef<HTMLDivElement>(null);
  const scrollingTo = useRef<number | null>(null);

  const categories = menu?.categories ?? [];
  const sections = useMemo(
    () =>
      categories
        .map((c) => ({ cat: c, items: (menu?.products ?? []).filter((p) => p.category_id === c.id) }))
        .filter((s) => s.items.length),
    [menu, categories],
  );
  const found = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return null;
    return (menu?.products ?? []).filter((p) => p.name.toLowerCase().includes(q) || p.description.toLowerCase().includes(q));
  }, [menu, query]);

  const current = active ?? sections[0]?.cat.id ?? null;
  const tabs = useMemo(() => sections.map(({ cat }) => ({ id: cat.id, title: cat.name, icon: CAT_ICONS[cat.icon] ?? "cup" })), [sections]);

  useEffect(() => {
    if (found) {
      setPinned(false);
      return;
    }
    let frame = 0;
    const check = () => {
      frame = 0;
      const inline = inlineRef.current;
      setPinned(!!inline && inline.getBoundingClientRect().top < 0);
      if (scrollingTo.current !== null) return;
      let id = sections[0]?.cat.id ?? null;
      for (const s of sections) {
        const el = document.getElementById(`cat-${s.cat.id}`);
        if (el && el.getBoundingClientRect().top - CHIPS_OFFSET - 20 <= 0) id = s.cat.id;
      }
      setActive(id);
    };
    // не чаще раза за кадр
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(check);
    };
    check();
    const off = subscribeScroll(onScroll);
    return () => {
      off();
      cancelAnimationFrame(frame);
    };
  }, [sections, found]);

  useEffect(() => {
    revealChip(inlineRef.current, current);
    revealChip(fixedRef.current, current);
  }, [current, pinned]);

  const jump = (id: number) => {
    const el = document.getElementById(`cat-${id}`);
    if (!el) return;
    setActive(id);
    scrollingTo.current = id;
    scrollToY(el.getBoundingClientRect().top + scrollTop() - CHIPS_OFFSET, true);
    window.setTimeout(() => (scrollingTo.current = null), 700);
  };

  // большой заголовок «Меню» плавно сжимается и гаснет при прокрутке (только transform/opacity)
  const titleRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let frame = 0;
    const apply = () => {
      frame = 0;
      const el = titleRef.current;
      if (!el) return;
      const p = Math.min(1, scrollTop() / 90);
      el.style.transform = `translateY(${-p * 10}px) scale(${1 - p * 0.12})`;
      el.style.opacity = String(1 - p * 0.85);
    };
    const off = subscribeScroll(() => {
      if (!frame) frame = requestAnimationFrame(apply);
    });
    return () => {
      off();
      cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <div className="screen">
      <div ref={titleRef} className="collapse-title">
        <TopBar title="Меню" />
      </div>

      <label className="card search glass--regular">
        <Icon name="search" />
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Найти напиток или десерт" type="search" enterKeyHint="search" />
        {query && (
          <button onClick={() => setQuery("")} aria-label="Очистить">
            <Icon name="close" size={18} />
          </button>
        )}
      </label>

      {!found && menu && (
        <div className="chips-glass">
          <PillTabs items={tabs} active={current} onChange={jump} stripRef={inlineRef} />
        </div>
      )}
      {!found &&
        menu &&
        createPortal(
          <div className={`chips-fixed ${pinned ? "chips-fixed--on" : ""}`} aria-hidden={!pinned}>
            <div className="chips-fixed__inner">
              <PillTabs items={tabs} active={current} onChange={jump} stripRef={fixedRef} />
            </div>
          </div>,
          document.body,
        )}
      {!menu && (
        <div className="chips">
          {[100, 150, 80, 110].map((w, i) => (
            <Skeleton key={i} h={40} w={w} r={20} />
          ))}
        </div>
      )}

      {!menu && (
        <div className="grid" style={{ marginTop: 12 }}>
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} h={250} />
          ))}
        </div>
      )}

      {found ? (
        <div className="grid" style={{ marginTop: 12 }}>
          {found.map((p, i) => (
            <ProductCard key={p.id} p={p} index={i} />
          ))}
        </div>
      ) : (
        sections.map(({ cat, items }) => (
          <section key={cat.id} id={`cat-${cat.id}`} className="menu-section">
            <h2 className="menu-section__title">{cat.name}</h2>
            <div className="grid">
              {items.map((p, i) => (
                <ProductCard key={p.id} p={p} index={i} />
              ))}
            </div>
          </section>
        ))
      )}

      {found && found.length === 0 && (
        <p className="muted" style={{ textAlign: "center", marginTop: 32 }}>
          Ничего не нашлось. Попробуйте «латте» или спросите AI-бариста в боте ✨
        </p>
      )}
    </div>
  );
}
