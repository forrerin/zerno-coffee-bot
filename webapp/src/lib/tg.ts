/**
 * Тонкая обёртка над @telegram-apps/sdk.
 * Вне Telegram (браузер, демо-режим) все вызовы безопасно превращаются в no-op,
 * а MainButton/BackButton рисуются в самом интерфейсе.
 */
import {
  backButton,
  hapticFeedback,
  init,
  isTMA,
  mainButton,
  miniApp,
  retrieveRawInitData,
  swipeBehavior,
  themeParams,
  viewport,
} from "@telegram-apps/sdk";

type Impact = "light" | "medium" | "heavy" | "rigid" | "soft";
type Notify = "error" | "success" | "warning";

function safe<T>(fn: () => T): T | undefined {
  try {
    return fn();
  } catch {
    return undefined;
  }
}

export const inTelegram: boolean = safe(() => isTMA()) ?? false;

let rawInitData = "";
let firstName = "";
let startParams = new URLSearchParams(window.location.search);

export function setupTelegram(onTheme: (dark: boolean) => void): void {
  if (!inTelegram) {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    onTheme(mq.matches);
    mq.addEventListener("change", (e) => onTheme(e.matches));
    return;
  }
  safe(() => init());
  rawInitData = safe(() => retrieveRawInitData()) ?? "";
  try {
    const user = new URLSearchParams(rawInitData).get("user");
    firstName = user ? (JSON.parse(user).first_name as string) : "";
  } catch {
    firstName = "";
  }

  safe(() => miniApp.mountSync());
  safe(() => themeParams.mountSync());
  safe(() => backButton.mount());
  safe(() => mainButton.mount());
  safe(() => {
    swipeBehavior.mount();
    swipeBehavior.disableVertical(); // чтобы свайп в корзине не закрывал приложение
  });
  safe(() =>
    viewport
      .mount()
      .then(() => {
        viewport.expand();
        // --tg-viewport-safe-area-inset-* и --tg-viewport-content-safe-area-inset-* для CSS
        safe(() => viewport.bindCssVars());
      })
      .catch(() => undefined),
  );

  const apply = () => {
    const dark = safe(() => themeParams.isDark()) ?? false;
    onTheme(dark);
    const bg = dark ? "#1A120D" : "#F7F1EA";
    safe(() => miniApp.setHeaderColor(bg));
    safe(() => miniApp.setBackgroundColor(bg));
    safe(() => miniApp.setBottomBarColor(bg));
  };
  apply();
  safe(() => themeParams.isDark.sub(apply));
  safe(() => miniApp.ready());
}

export const tg = {
  initData: () => rawInitData,
  firstName: () => firstName,
  startParam: (key: string) => startParams.get(key),
  clearStartParams: () => {
    startParams = new URLSearchParams();
  },

  haptic(style: Impact = "light") {
    if (inTelegram) safe(() => hapticFeedback.impactOccurred(style));
    else if ("vibrate" in navigator) safe(() => navigator.vibrate(8));
  },
  notify(type: Notify) {
    if (inTelegram) safe(() => hapticFeedback.notificationOccurred(type));
  },
  select() {
    if (inTelegram) safe(() => hapticFeedback.selectionChanged());
  },

  backButton: {
    show: () => inTelegram && safe(() => backButton.show()),
    hide: () => inTelegram && safe(() => backButton.hide()),
    onClick: (fn: () => void): (() => void) =>
      (inTelegram && safe(() => backButton.onClick(fn))) || (() => undefined),
  },

  mainButton: {
    set(params: { text: string; visible: boolean; enabled?: boolean; loading?: boolean }) {
      if (!inTelegram) return;
      // SDK молча игнорирует setParams с пустым текстом — поэтому текст никогда не пустой,
      // иначе кнопка не скроется и «зависнет» на экране
      if (params.text) lastText = params.text;
      safe(() =>
        mainButton.setParams({
          text: lastText,
          isVisible: params.visible,
          isEnabled: params.enabled ?? true,
          isLoaderVisible: params.visible ? (params.loading ?? false) : false,
          backgroundColor: "#E8A35C",
          textColor: "#2A1A0E",
          hasShineEffect: params.visible && !params.loading,
        }),
      );
    },
    onClick: (fn: () => void): (() => void) =>
      (inTelegram && safe(() => mainButton.onClick(fn))) || (() => undefined),
  },
};

let lastText = "Продолжить";
