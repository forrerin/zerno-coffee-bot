import { animate, motion, useMotionValue, useTransform } from "framer-motion";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { spring } from "../lib/motion";
import { scrollToY } from "../lib/scroll";
import { tg } from "../lib/tg";
import { useApp, type Tab } from "../store";
import { Icon } from "./Icon";

const TABS: { id: Tab; title: string; icon: string }[] = [
  { id: "home", title: "Главная", icon: "home" },
  { id: "menu", title: "Меню", icon: "cup" },
  { id: "orders", title: "Заказы", icon: "receipt" },
  { id: "profile", title: "Профиль", icon: "user" },
];

const PAD = 6; // внутренний отступ капсулы
const MOVE_THRESHOLD = 6; // px — сдвиг, после которого касание становится жестом
const HOLD_MS = 220; // удержание без движения тоже «берёт» пилюлю

/**
 * Нижнее меню с жестом: пилюлю можно зажать и вести пальцем — она идёт за пальцем 1:1,
 * подсвечивает вкладку под пальцем (haptic на каждой), после отпускания пружиной встаёт
 * на место и открывает страницу. Обычный тап тоже работает.
 *
 * На сенсорных экранах жест сделан на touch-событиях с preventDefault: на iOS
 * pointer-события отменяются системным долгим нажатием (pointercancel), из-за чего
 * пилюля «отскакивала» назад.
 */
export function TabBar() {
  const tab = useApp((s) => s.tab);
  const setTab = useApp((s) => s.setTab);
  const isAdmin = useApp((s) => s.me?.is_admin);
  const tabs = isAdmin ? [...TABS, { id: "admin" as Tab, title: "Админка", icon: "shield" }] : TABS;
  const index = Math.max(0, tabs.findIndex((t) => t.id === tab));

  const navRef = useRef<HTMLElement>(null);
  const [itemW, setItemW] = useState(0);
  const x = useMotionValue(0);
  const lift = useMotionValue(1);
  const [hover, setHover] = useState<number | null>(null);

  // актуальные значения для обработчиков, навешанных один раз
  const live = useRef({ tabs, tab, index, itemW, setTab });
  live.current = { tabs, tab, index, itemW, setTab };

  useLayoutEffect(() => {
    const nav = navRef.current;
    if (!nav) return;
    const measure = () => setItemW((nav.clientWidth - PAD * 2) / tabs.length);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(nav);
    return () => ro.disconnect();
  }, [tabs.length]);

  const dragging = useRef(false);

  // смена вкладки не жестом (тап, код) — пилюля переливается пружиной
  useEffect(() => {
    if (!itemW || dragging.current) return;
    const c = animate(x, index * itemW, spring.smooth);
    return () => c.stop();
  }, [index, itemW, x]);

  useLayoutEffect(() => {
    if (itemW) x.set(index * itemW);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemW]);

  useEffect(() => {
    const nav = navRef.current;
    if (!nav) return;

    let startX = 0;
    let active = false;
    let last = -1;
    let holdTimer = 0;
    let pending = false;

    const localX = (clientX: number) => clientX - nav.getBoundingClientRect().left - PAD;
    const indexAt = (px: number) => {
      const { tabs: t, itemW: w } = live.current;
      return Math.min(t.length - 1, Math.max(0, Math.floor(px / w)));
    };
    const open = (i: number) => {
      const { tabs: t, tab: cur, setTab: go } = live.current;
      const target = t[i];
      if (!target) return;
      if (target.id !== cur) {
        go(target.id);
        scrollToY(0);
      } else {
        scrollToY(0, true);
      }
    };

    const grab = () => {
      if (active) return;
      active = true;
      dragging.current = true;
      animate(lift, 1.07, spring.snappy);
      tg.haptic("light");
    };

    const follow = (clientX: number) => {
      const w = live.current.itemW;
      const n = live.current.tabs.length;
      const lx = localX(clientX);
      x.set(Math.min((n - 1) * w, Math.max(0, lx - w / 2)));
      const i = indexAt(lx);
      if (i !== last) {
        last = i;
        tg.select();
        setHover(i);
      }
    };

    const start = (clientX: number) => {
      if (!live.current.itemW) return;
      pending = true;
      startX = clientX;
      active = false;
      last = indexAt(localX(clientX));
      window.clearTimeout(holdTimer);
      // удержание пальца на месте тоже берёт пилюлю
      holdTimer = window.setTimeout(() => {
        if (!pending) return;
        grab();
        follow(startX);
      }, HOLD_MS);
    };

    const move = (clientX: number) => {
      if (!pending) return false;
      if (!active && Math.abs(clientX - startX) >= MOVE_THRESHOLD) grab();
      if (active) follow(clientX);
      return active;
    };

    const end = (clientX: number | null) => {
      if (!pending) return;
      pending = false;
      window.clearTimeout(holdTimer);
      const wasActive = active;
      active = false;
      dragging.current = false;
      animate(lift, 1, spring.snappy);
      setHover(null);
      const w = live.current.itemW;
      if (clientX === null) {
        animate(x, live.current.index * w, spring.smooth);
        return;
      }
      const i = indexAt(localX(clientX));
      if (!wasActive) tg.select();
      animate(x, i * w, spring.smooth);
      open(i);
    };

    // --- касания: preventDefault не даёт iOS отменить жест долгим нажатием или скроллом
    const onTouchStart = (e: TouchEvent) => {
      e.preventDefault();
      start(e.touches[0].clientX);
    };
    const onTouchMove = (e: TouchEvent) => {
      e.preventDefault();
      move(e.touches[0].clientX);
    };
    const onTouchEnd = (e: TouchEvent) => {
      e.preventDefault();
      end(e.changedTouches[0]?.clientX ?? null);
    };
    const onTouchCancel = () => end(null);

    // --- мышь (Telegram Desktop, браузер)
    const onPointerDown = (e: PointerEvent) => {
      if (e.pointerType !== "mouse" || e.button !== 0) return;
      nav.setPointerCapture(e.pointerId);
      start(e.clientX);
    };
    const onPointerMove = (e: PointerEvent) => {
      if (e.pointerType === "mouse") move(e.clientX);
    };
    const onPointerUp = (e: PointerEvent) => {
      if (e.pointerType === "mouse") end(e.clientX);
    };

    nav.addEventListener("touchstart", onTouchStart, { passive: false });
    nav.addEventListener("touchmove", onTouchMove, { passive: false });
    nav.addEventListener("touchend", onTouchEnd, { passive: false });
    nav.addEventListener("touchcancel", onTouchCancel);
    nav.addEventListener("pointerdown", onPointerDown);
    nav.addEventListener("pointermove", onPointerMove);
    nav.addEventListener("pointerup", onPointerUp);
    return () => {
      window.clearTimeout(holdTimer);
      nav.removeEventListener("touchstart", onTouchStart);
      nav.removeEventListener("touchmove", onTouchMove);
      nav.removeEventListener("touchend", onTouchEnd);
      nav.removeEventListener("touchcancel", onTouchCancel);
      nav.removeEventListener("pointerdown", onPointerDown);
      nav.removeEventListener("pointermove", onPointerMove);
      nav.removeEventListener("pointerup", onPointerUp);
    };
  }, [x, lift]);

  // в движении пилюля слегка растягивается по скорости — «переливается», как жидкость
  const scaleX = useTransform([x, lift], ([, l]) => (l as number) * (1 + Math.min(0.14, Math.abs(x.getVelocity()) / 8000)));

  const highlighted = hover ?? index;

  return (
    <nav ref={navRef} className="tabbar glass glass--thick" role="tablist">
      <motion.span className="tabbar__indicator" style={{ width: itemW || undefined, x, scaleX, scaleY: lift }} />
      {tabs.map((t, i) => (
        <div
          key={t.id}
          role="tab"
          aria-selected={t.id === tab}
          aria-label={t.title}
          tabIndex={0}
          className={`tabbar__item ${i === highlighted ? "tabbar__item--active" : ""}`}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") live.current.setTab(t.id);
          }}
        >
          <motion.span animate={{ y: i === highlighted ? -1 : 0, scale: i === highlighted ? 1.08 : 1 }} transition={spring.snappy} style={{ display: "grid" }}>
            <Icon name={t.icon} size={22} />
          </motion.span>
          {t.title}
        </div>
      ))}
    </nav>
  );
}
