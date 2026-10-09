/**
 * Прокрутка Mini App идёт не по документу, а во внутреннем контейнере #scroller.
 * В Telegram на iOS прокрутку документа перехватывает жест сворачивания окна:
 * Telegram «тянет» страницу обратно и закреплённые панели дёргаются.
 */
export const SCROLLER_ID = "scroller";

export function scroller(): HTMLElement {
  return document.getElementById(SCROLLER_ID) ?? document.documentElement;
}

export const scrollTop = () => scroller().scrollTop;

export function scrollToY(top: number, smooth = false) {
  scroller().scrollTo({ top, behavior: smooth ? "smooth" : "auto" });
}

export function onScroll(fn: () => void): () => void {
  const el = scroller();
  el.addEventListener("scroll", fn, { passive: true });
  return () => el.removeEventListener("scroll", fn);
}

/** Блокирует прокрутку (пока открыт bottom sheet). Возвращает функцию разблокировки. */
export function lockScroll(): () => void {
  const el = scroller();
  const prev = el.style.overflowY;
  el.style.overflowY = "hidden";
  return () => {
    el.style.overflowY = prev;
  };
}
