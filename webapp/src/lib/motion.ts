/**
 * Моушен-система «Зерна»: единые пружины, длительности и правила для всего приложения.
 * Характер движения — тёплый и мягкий: вход медленнее выхода, без резкости и лишнего bounce.
 */
import type { Transition } from "framer-motion";

/** Пружины вместо линейных easing */
export const spring = {
  /** тапы, переключатели, индикаторы */
  snappy: { type: "spring", stiffness: 500, damping: 30, mass: 0.8 } as Transition,
  /** переходы экранов, шторки */
  smooth: { type: "spring", stiffness: 300, damping: 30 } as Transition,
  /** «награды»: добавление в корзину, успех */
  bouncy: { type: "spring", stiffness: 400, damping: 15 } as Transition,
};

/** Длительности для не-пружинных анимаций, секунды */
export const dur = { micro: 0.12, short: 0.22, medium: 0.35, long: 0.5 };

/** Easing (Material 3 emphasized) */
export const ease = {
  emphasized: [0.2, 0, 0, 1] as [number, number, number, number],
  exit: [0.3, 0, 1, 1] as [number, number, number, number],
};

/** Каскад списков: 40 мс между элементами, не больше 8 в каскаде — остальные сразу */
export const stagger = (index: number, step = 0.04, max = 8) => Math.min(index, max) * step;

export const prefersReducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * Облегчённый режим для слабых устройств: без дрейфа фона, параллакса и частиц.
 * Признаки: мало ядер / памяти, «Уменьшить движение» или просадки FPS при старте.
 */
type NavigatorWithMemory = Navigator & { deviceMemory?: number };

export const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

function detectLowEnd(): boolean {
  // iPhone всегда сообщает 4 ядра и не сообщает память — по этим признакам его не судим
  if (isIOS) return false;
  const nav = navigator as NavigatorWithMemory;
  const cores = nav.hardwareConcurrency ?? 8;
  const memory = nav.deviceMemory ?? 8;
  return cores <= 4 || memory <= 4;
}

export let lite = prefersReducedMotion() || detectLowEnd();

/** Короткий замер FPS после старта: если кадры заметно просаживаются — включаем облегчённый режим */
function probeFps() {
  if (lite) return;
  let frames = 0;
  const start = performance.now();
  const tick = (t: number) => {
    frames++;
    if (t - start < 1000) requestAnimationFrame(tick);
    else if (frames < 38 && document.visibilityState === "visible") setLite(true);
  };
  requestAnimationFrame(tick);
}

function setLite(v: boolean) {
  lite = v;
  document.documentElement.classList.toggle("lite", v);
}

export function setupMotion() {
  setLite(lite);
  document.documentElement.classList.toggle("ios", isIOS);
  // через секунду после старта, когда основная загрузка позади
  window.setTimeout(probeFps, 2500);
  // свёрнутое приложение не должно крутить анимации
  const pause = () => document.documentElement.classList.toggle("paused", document.visibilityState === "hidden");
  document.addEventListener("visibilitychange", pause);
  // блик стекла следует за точкой касания (CSS-переменные --mx/--my)
  document.addEventListener(
    "pointerdown",
    (e) => {
      const el = (e.target as HTMLElement | null)?.closest<HTMLElement>('.card[role="button"], button.card, .pay-method');
      if (!el) return;
      const r = el.getBoundingClientRect();
      el.style.setProperty("--mx", `${e.clientX - r.left}px`);
      el.style.setProperty("--my", `${e.clientY - r.top}px`);
    },
    { passive: true },
  );
}
