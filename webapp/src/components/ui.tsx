import { animate, AnimatePresence, motion, useDragControls, useMotionValue, useTransform } from "framer-motion";
import { dur, ease, spring } from "../lib/motion";
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { indexMenu, plural, rub, unitPrice } from "../lib/format";
import { lockScroll } from "../lib/scroll";
import { inTelegram, tg } from "../lib/tg";
import type { Badge, OrderStatus } from "../lib/types";
import { registerSheet, useApp } from "../store";
import { Art } from "./Art";
import { Icon } from "./Icon";

/* ---------- MainButton: нативная в Telegram, своя в браузере ---------- */

interface MainButtonProps {
  text: string;
  onClick: () => void;
  disabled?: boolean;
  loading?: boolean;
  visible?: boolean;
}

/**
 * Нативная MainButton одна на всё приложение, а хотят её несколько экранов сразу
 * (корзина + открытый поверх лист оплаты). Диспетчер хранит всех «владельцев»
 * и показывает кнопку последнего видимого — того, что сейчас сверху.
 */
interface Owner {
  id: number;
  text: string;
  visible: boolean;
  enabled: boolean;
  loading: boolean;
  onClick: () => void;
}

const owners: Owner[] = [];
const listeners = new Set<() => void>();
let ownerSeq = 0;
let lastPress = 0;

const topOwner = () => [...owners].reverse().find((o) => o.visible) ?? null;

let pressBound = false;

function syncMainButton() {
  // подписываемся при первом использовании — к этому моменту SDK уже инициализирован
  if (inTelegram && !pressBound) {
    pressBound = true;
    tg.mainButton.onClick(pressTop);
  }
  const top = topOwner();
  tg.mainButton.set(top ? { text: top.text, visible: true, enabled: top.enabled, loading: top.loading } : { text: "", visible: false });
  listeners.forEach((l) => l());
}

function pressTop() {
  const top = topOwner();
  const now = Date.now();
  // защита от двойного тапа: второе нажатие в течение 400 мс игнорируем
  if (!top || !top.enabled || top.loading || now - lastPress < 400) return;
  lastPress = now;
  hideKeyboard();
  tg.haptic("medium");
  top.onClick();
}

/** Убирает экранную клавиатуру: иначе на iOS она остаётся поверх открывшегося листа */
export function hideKeyboard() {
  const el = document.activeElement as HTMLElement | null;
  if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA")) el.blur();
}

function useTopOwnerId() {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => topOwner()?.id ?? 0,
  );
}

export function MainButton({ text, onClick, disabled = false, loading = false, visible = true }: MainButtonProps) {
  const idRef = useRef(0);
  if (!idRef.current) idRef.current = ++ownerSeq;
  const id = idRef.current;
  const handler = useRef(onClick);
  handler.current = onClick;

  useEffect(() => {
    owners.push({ id, text, visible, enabled: !disabled, loading, onClick: () => handler.current() });
    syncMainButton();
    return () => {
      const i = owners.findIndex((o) => o.id === id);
      if (i >= 0) owners.splice(i, 1);
      syncMainButton();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    const o = owners.find((x) => x.id === id);
    if (!o) return;
    Object.assign(o, { text, visible, enabled: !disabled, loading });
    syncMainButton();
  }, [id, text, visible, disabled, loading]);

  const topId = useTopOwnerId();
  if (inTelegram || topId !== id) return null;
  // портал в body: внутри стеклянной шторки (backdrop-filter) position: fixed считается от шторки
  return createPortal(
    <div className="main-button-bar">
      <button className="btn btn--block" disabled={disabled || loading} onClick={pressTop}>
        {loading ? <Spinner /> : text}
      </button>
    </div>,
    document.body,
  );
}

export function Spinner({ size = 22 }: { size?: number }) {
  return (
    <motion.svg width={size} height={size} viewBox="0 0 24 24" animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 0.9, ease: "linear" }}>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity=".3" strokeWidth="3" fill="none" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" fill="none" strokeLinecap="round" />
    </motion.svg>
  );
}

/* ---------- Bottom sheet ---------- */

export function Sheet({ open, onClose, children }: { open: boolean; onClose: () => void; children: React.ReactNode }) {
  const controls = useDragControls();
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    if (!open) return;
    hideKeyboard();
    return registerSheet(() => closeRef.current());
  }, [open]);
  useEffect(() => {
    if (!open) return;
    return lockScroll();
  }, [open]);

  return <AnimatePresence>{open && <SheetPanel onClose={onClose} controls={controls}>{children}</SheetPanel>}</AnimatePresence>;
}

/** Шторка: следует за пальцем 1:1, закрывается по расстоянию или скорости свайпа,
 *  фон затемняется пропорционально положению шторки. */
function SheetPanel({ onClose, controls, children }: { onClose: () => void; controls: ReturnType<typeof useDragControls>; children: React.ReactNode }) {
  const y = useMotionValue(window.innerHeight);
  // затемнение фона следует за положением шторки
  const dim = useTransform(y, (v) => 1 - Math.min(0.9, Math.max(0, v) / 520));

  useEffect(() => {
    tg.haptic("light");
  }, []);

  return (
    <>
      {/* при закрытии фон сразу перестаёт ловить нажатия, иначе первые тапы после закрытия «теряются» */}
      <motion.div
        className="sheet-backdrop"
        onClick={onClose}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0, pointerEvents: "none" }}
        transition={{ duration: dur.short, ease: ease.emphasized }}
      >
        <motion.div className="sheet-backdrop__fill" style={{ opacity: dim }} />
      </motion.div>
      <motion.div
        className="sheet"
        style={{ y }}
        initial={{ y: window.innerHeight }}
        animate={{ y: 0 }}
        exit={{ y: window.innerHeight, pointerEvents: "none", transition: { duration: dur.medium, ease: ease.exit } }}
        transition={spring.smooth}
        drag="y"
        dragConstraints={{ top: 0, bottom: 0 }}
        dragElastic={{ top: 0, bottom: 1 }}
        dragListener={false}
        dragControls={controls}
        onDragEnd={(_, info) => {
          if (info.offset.y > 110 || info.velocity.y > 600) onClose();
          else tg.haptic("rigid"); // шторка защёлкнулась обратно
        }}
        onPointerDown={(e) => {
          // свайп вниз можно начать за верхнюю часть шторки (ручка и фото), когда она не прокручена
          const el = e.currentTarget as HTMLElement;
          const fromTop = e.clientY - el.getBoundingClientRect().top;
          if (el.scrollTop <= 0 && fromTop < 260 && !(e.target as HTMLElement).closest("button, input, textarea")) controls.start(e);
        }}
      >
        <div className="sheet__grip-area">
          <div className="sheet__grip" />
        </div>
        {children}
      </motion.div>
    </>
  );
}

/* ---------- Мелочи ---------- */

const BADGE_TITLES: Record<Badge, string> = { hit: "Хит", new: "Новинка", decaf: "Без кофеина" };

export function Badges({ badges }: { badges: Badge[] }) {
  if (!badges.length) return null;
  return (
    <div className="badges">
      {badges.map((b) => (
        <span key={b} className={`badge badge--${b}`}>
          {BADGE_TITLES[b]}
        </span>
      ))}
    </div>
  );
}

export function Skeleton({ h, w = "100%", r }: { h: number; w?: number | string; r?: number }) {
  return <div className="skeleton" style={{ height: h, width: w, borderRadius: r }} />;
}

export function Qty({ value, onChange, min = 1 }: { value: number; onChange: (v: number) => void; min?: number }) {
  // направление перелистывания: вверх при «+», вниз при «−»
  const prev = useRef(value);
  const dirRef = useRef(0);
  if (prev.current !== value) {
    dirRef.current = value > prev.current ? 1 : -1;
    prev.current = value;
  }
  return (
    // не даём жесту свайпа строки корзины «съесть» нажатие на +/−
    <div className="qty" onPointerDownCapture={(e) => e.stopPropagation()}>
      <button aria-label="Меньше" onClick={() => (tg.select(), onChange(Math.max(min, value - 1)))}>
        <Icon name="minus" size={18} />
      </button>
      <span className="qty__digit num">
        <AnimatePresence initial={false} custom={dirRef.current}>
          <motion.span
            key={value}
            custom={dirRef.current}
            variants={{
              enter: (d: number) => ({ y: d > 0 ? 14 : -14, opacity: 0 }),
              center: { y: 0, opacity: 1 },
              exit: (d: number) => ({ y: d > 0 ? -14 : 14, opacity: 0 }),
            }}
            initial="enter"
            animate="center"
            exit="exit"
            transition={spring.snappy}
          >
            {value}
          </motion.span>
        </AnimatePresence>
      </span>
      <button aria-label="Больше" onClick={() => (tg.select(), onChange(Math.min(20, value + 1)))}>
        <Icon name="plus" size={18} />
      </button>
    </div>
  );
}

export function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button className={`toggle ${on ? "toggle--on" : ""}`} role="switch" aria-checked={on} onClick={() => (tg.select(), onChange(!on))}>
      <i />
    </button>
  );
}

export function Price({ value }: { value: number }) {
  return <span className="price">{rub(value)}</span>;
}

/* ---------- Верхняя панель с корзиной ---------- */

export function CartButton() {
  const count = useApp((s) => s.cart.reduce((n, l) => n + l.qty, 0));
  const bump = useApp((s) => s.cartBump);
  const push = useApp((s) => s.push);
  return (
    <motion.button
      id="cart-target"
      className="icon-btn glass glass--regular glass--blur"
      aria-label="Корзина"
      onClick={() => (tg.haptic(), push({ name: "cart" }))}
      key={bump}
      animate={bump ? { scale: [1, 1.18, 0.94, 1] } : undefined}
      transition={{ duration: 0.45, delay: 0.55 }}
    >
      <Icon name="bag" />
      {count > 0 && (
        <motion.span className="cart-badge num" key={count} initial={{ scale: 0.4, y: -6 }} animate={{ scale: 1, y: 0 }} transition={{ type: "spring", stiffness: 500, damping: 14, delay: 0.55 }}>
          {count}
        </motion.span>
      )}
    </motion.button>
  );
}

export function TopBar({ title, sub, back, right }: { title?: React.ReactNode; sub?: React.ReactNode; back?: boolean; right?: React.ReactNode }) {
  const goBack = useApp((s) => s.back);
  return (
    <div className="topbar">
      {back && !inTelegram && (
        <button className="icon-btn glass glass--regular glass--blur" onClick={goBack} aria-label="Назад">
          <Icon name="back" />
        </button>
      )}
      <div className="topbar__title">
        {title && <h1>{title}</h1>}
        {sub && <div className="muted small">{sub}</div>}
      </div>
      {right ?? <CartButton />}
    </div>
  );
}

/* ---------- Полёт чашки в корзину ---------- */

export function FlyLayer() {
  const fly = useApp((s) => s.fly);
  return fly ? <FlyItem key={fly.id} from={fly.from} art={fly.art} /> : null;
}

/** Где «приземлится» товар: значок в плавающей плашке корзины, иначе — кнопка корзины в шапке */
function landingPoint(): { x: number; y: number } {
  const bar = document.querySelector<HTMLElement>(".cart-bar-wrap");
  if (bar) {
    // offset* — без учёта transform, т.е. конечное положение плашки, даже если она ещё выезжает
    return { x: bar.offsetLeft + 30, y: bar.offsetTop + 28 };
  }
  const icon = document.getElementById("cart-target")?.getBoundingClientRect();
  return icon ? { x: icon.left + icon.width / 2, y: icon.top + icon.height / 2 } : { x: window.innerWidth - 40, y: 40 };
}

/** Копия фото летит по кривой Безье в корзину; в момент приземления — haptic и «глоток» плашки */
function FlyItem({ from, art }: { from: { x: number; y: number }; art: string }) {
  const t = useMotionValue(0);
  const [to, setTo] = useState<{ x: number; y: number } | null>(null);

  useLayoutEffect(() => setTo(landingPoint()), []);

  // контрольная точка дуги — выше и между стартом и финишем
  const cx = to ? (from.x + to.x) / 2 + (to.x > from.x ? -40 : 40) : from.x;
  const cy = to ? Math.min(from.y, to.y) - 140 : from.y;
  const bez = (a: number, c: number, b: number) => (p: number) => (1 - p) * (1 - p) * a + 2 * (1 - p) * p * c + p * p * b;
  const x = useTransform(t, (p) => (to ? bez(from.x, cx, to.x)(p) : from.x) - 24);
  const y = useTransform(t, (p) => (to ? bez(from.y, cy, to.y)(p) : from.y) - 24);
  const scale = useTransform(t, [0, 0.45, 1], [1, 1.12, 0.3]);
  const rotate = useTransform(t, [0, 1], [0, 24]);

  useEffect(() => {
    if (!to) return;
    const c = animate(t, 1, {
      duration: 0.62,
      ease: [0.45, 0, 0.25, 1],
      onComplete: () => {
        tg.haptic("medium"); // товар «приземлился»
        useApp.setState((s) => ({ fly: null, cartLand: s.cartLand + 1 }));
      },
    });
    return () => c.stop();
  }, [to, t]);

  if (!to) return null;
  return (
    <motion.div className="fly" style={{ x, y, scale, rotate }}>
      <Art src={art} />
    </motion.div>
  );
}

/* ---------- Тосты ---------- */

export function Toast() {
  const toast = useApp((s) => s.toast);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => useApp.setState({ toast: null }), 2600);
    return () => clearTimeout(t);
  }, [toast]);
  return (
    <AnimatePresence>
      {toast && (
        <motion.div
          key={toast.id}
          className={`toast ${toast.tone === "error" ? "toast--error" : ""}`}
          initial={{ y: -40, x: "-50%", opacity: 0 }}
          animate={{ y: 0, x: "-50%", opacity: 1 }}
          exit={{ y: -40, x: "-50%", opacity: 0 }}
        >
          {toast.text}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/* ---------- Прогресс заказа «полоска кофе» ---------- */

const PROGRESS: Partial<Record<OrderStatus, number>> = { new: 0.05, paid: 0.3, preparing: 0.65, ready: 1, completed: 1 };

export function CoffeeProgress({ status }: { status: OrderStatus }) {
  const p = PROGRESS[status] ?? 0;
  // смена статуса «ощущается»: haptic в момент перехода, линия доливается пружиной
  const prevStatus = useRef(status);
  useEffect(() => {
    if (prevStatus.current !== status) {
      prevStatus.current = status;
      if (status === "ready") tg.notify("success");
      else tg.select();
    }
  }, [status]);
  const steps: [OrderStatus, string][] = [
    ["paid", "Принят"],
    ["preparing", "Готовится"],
    ["ready", "Готов"],
  ];
  const idx = steps.findIndex(([s]) => s === status);
  return (
    <div>
      <div className="coffee-bar">
        <motion.div className="coffee-bar__fill" initial={{ scaleX: 0 }} animate={{ scaleX: p }} transition={spring.smooth} />
      </div>
      <div className="steps">
        {steps.map(([s, title], i) => (
          <span key={s} className={`${i <= idx || status === "completed" ? "on" : ""} ${i === idx && status !== "ready" ? "now" : ""}`}>
            {title}
          </span>
        ))}
      </div>
    </div>
  );
}

export function StatusPill({ status, title }: { status: OrderStatus; title: string }) {
  return <span className={`status status--${status}`}>{title}</span>;
}

export function Empty({ art, title, text, action }: { art: string; title: string; text?: string; action?: React.ReactNode }) {
  return (
    <div className="empty">
      <div className="empty__art">
        <Art src={art} />
      </div>
      <h2>{title}</h2>
      {text && <p className="muted">{text}</p>}
      {action}
    </div>
  );
}


/* ---------- табы-пилюли с переезжающим индикатором ---------- */

interface PillTab<T extends string | number> {
  id: T;
  title: React.ReactNode;
  icon?: string;
}

/**
 * Лента пилюль: активный пункт подсвечивает индикатор, который «переезжает» пружиной.
 * Индикатор двигается только через transform (без layout-анимаций, которые дрожали в iOS).
 */
export function PillTabs<T extends string | number>({
  items,
  active,
  onChange,
  stripRef,
  className = "",
}: {
  items: PillTab<T>[];
  active: T | null;
  onChange: (id: T) => void;
  stripRef?: React.RefObject<HTMLDivElement | null>;
  className?: string;
}) {
  const ownRef = useRef<HTMLDivElement>(null);
  const ref = stripRef ?? ownRef;
  const [box, setBox] = useState<{ x: number; w: number } | null>(null);

  useLayoutEffect(() => {
    const measure = () => {
      const chip = ref.current?.querySelector<HTMLElement>(`[data-tab="${String(active)}"]`);
      setBox(chip ? { x: chip.offsetLeft, w: chip.offsetWidth } : null);
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (ref.current) ro.observe(ref.current);
    return () => ro.disconnect();
  }, [active, items.length, ref]);

  return (
    <div className={`chips chips--indicated ${className}`} ref={ref} role="tablist">
      {box && <LiquidIndicator x={box.x} w={box.w} />}
      {items.map((t) => {
        const on = t.id === active;
        return (
          <button
            key={String(t.id)}
            data-tab={String(t.id)}
            role="tab"
            aria-selected={on}
            className={`chip ${on ? "chip--active" : ""}`}
            onClick={() => {
              tg.select();
              onChange(t.id);
            }}
          >
            {t.icon && <Icon name={t.icon} size={18} />}
            <span>{t.title}</span>
          </button>
        );
      })}
    </div>
  );
}

/** Индикатор-пилюля: ширина и позиция пружинят с разной жёсткостью — «перелив», как у жидкости */
function LiquidIndicator({ x, w }: { x: number; w: number }) {
  const mx = useMotionValue(x);
  const mw = useMotionValue(w);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      mx.set(x);
      mw.set(w);
      return;
    }
    const a = animate(mx, x, spring.smooth);
    const b = animate(mw, w, { type: "spring", stiffness: 420, damping: 32 });
    return () => {
      a.stop();
      b.stop();
    };
  }, [x, w, mx, mw]);
  const scaleY = useTransform(mx, () => 1 - Math.min(0.08, Math.abs(mx.getVelocity()) / 12000));
  return <motion.span className="chips__indicator" style={{ x: mx, width: mw, scaleY }} />;
}

/** Галочка, которая «рисуется» линией при выборе */
export function DrawCheck({ size = 15 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <motion.path
        d="m5 12.5 4.5 4.5L19 7.5"
        stroke="currentColor"
        strokeWidth={3}
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 0.28, ease: [0.2, 0, 0, 1] }}
      />
    </svg>
  );
}

/* ---------- сегментированный контрол ---------- */

export function Segmented<T extends string>({
  items,
  active,
  onChange,
}: {
  items: { id: T; title: React.ReactNode; sub?: React.ReactNode }[];
  active: T | null;
  onChange: (id: T) => void;
}) {
  const index = Math.max(0, items.findIndex((i) => i.id === active));
  return (
    <div className="seg" role="radiogroup">
      <span className="seg__indicator" style={{ width: `calc((100% - 8px) / ${items.length})`, transform: `translateX(${index * 100}%)` }} />
      {items.map((i) => (
        <button
          key={i.id}
          role="radio"
          aria-checked={i.id === active}
          className={`seg__item ${i.id === active ? "seg__item--active" : ""}`}
          onClick={() => {
            tg.select();
            onChange(i.id);
          }}
        >
          <span>{i.title}</span>
          {i.sub && <small>{i.sub}</small>}
        </button>
      ))}
    </div>
  );
}

/* ---------- цена с анимацией «count-up» ---------- */

export function AnimatedPrice({ value, className = "price" }: { value: number; className?: string }) {
  const mv = useMotionValue(value);
  const text = useTransform(mv, (v) => rub(Math.round(v)));
  useEffect(() => {
    const controls = animate(mv, value, { duration: 0.35, ease: [0.22, 1, 0.36, 1] });
    return () => controls.stop();
  }, [mv, value]);
  return <motion.span className={className}>{text}</motion.span>;
}

/* ---------- плавающая плашка корзины ---------- */

export function CartBar({ hidden }: { hidden?: boolean }) {
  const cart = useApp((s) => s.cart);
  const menu = useApp((s) => s.menu);
  const push = useApp((s) => s.push);
  const land = useApp((s) => s.cartLand);
  const count = cart.reduce((n, l) => n + l.qty, 0);
  const barRef = useRef<HTMLButtonElement>(null);
  const iconRef = useRef<HTMLSpanElement>(null);

  // товар «приземлился» — плашка коротко пружинит и «глотает» его (без пересоздания: сумма продолжает перекатываться)
  useEffect(() => {
    if (!land) return;
    if (barRef.current) animate(barRef.current, { scale: [1.05, 1] }, spring.bouncy);
    if (iconRef.current) animate(iconRef.current, { scale: [1.35, 1], rotate: [-12, 0] }, spring.bouncy);
  }, [land]);
  const { products, modifiers } = indexMenu(menu);
  const total = cart.reduce((sum, l) => {
    const p = products.get(l.product_id);
    return p ? sum + unitPrice(p, l.size, l.modifier_ids, modifiers) * l.qty : sum;
  }, 0);

  return (
    <AnimatePresence>
      {count > 0 && !hidden && (
        // обёртка выезжает снизу при первом добавлении
        <motion.div
          className="cart-bar-wrap"
          initial={{ y: 96, opacity: 0, scale: 0.92 }}
          animate={{ y: 0, opacity: 1, scale: 1 }}
          exit={{ y: 96, opacity: 0, transition: { duration: dur.short, ease: ease.exit } }}
          transition={spring.smooth}
        >
          <button
            ref={barRef}
            className="cart-bar glass glass--thick glass--blur"
            onClick={() => {
              tg.haptic();
              push({ name: "cart" });
            }}
          >
            <span ref={iconRef} style={{ display: "grid" }}>
              <Icon name="bag" />
            </span>
            <span className="grow">
              {count} {plural(count, ["позиция", "позиции", "позиций"])}
            </span>
            <span className="cart-bar__go">
              <AnimatedPrice value={total} className="num" />
              <Icon name="chevron" size={18} />
            </span>
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}


/**
 * Корзина в Telegram — нативная кнопка Telegram (её рисует само приложение Telegram
 * системными средствами iOS/Android, без нагрузки на веб-страницу).
 * Вне Telegram показывается веб-плашка CartBar.
 */
export function CartMainButton() {
  const cart = useApp((s) => s.cart);
  const menu = useApp((s) => s.menu);
  const push = useApp((s) => s.push);
  const count = cart.reduce((n, l) => n + l.qty, 0);
  const { products, modifiers } = indexMenu(menu);
  const total = cart.reduce((sum, l) => {
    const p = products.get(l.product_id);
    return p ? sum + unitPrice(p, l.size, l.modifier_ids, modifiers) * l.qty : sum;
  }, 0);
  return (
    <MainButton
      visible={count > 0}
      text={`Корзина · ${count} ${plural(count, ["позиция", "позиции", "позиций"])} · ${rub(total)}`}
      onClick={() => push({ name: "cart" })}
    />
  );
}
