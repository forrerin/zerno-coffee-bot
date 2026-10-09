import { AnimatePresence, motion } from "framer-motion";
import { lazy, Suspense, useCallback, useEffect, useState } from "react";
import { ArtDefs } from "./components/Art";
import { Background } from "./components/Background";
import { Intro } from "./components/Intro";
import { TabBar } from "./components/TabBar";
import { CartBar, CartMainButton, FlyLayer, Skeleton, Toast } from "./components/ui";
import { dur, ease, spring } from "./lib/motion";
import { SCROLLER_ID, scrollToY } from "./lib/scroll";
import { inTelegram, tg } from "./lib/tg";
import { Cart } from "./screens/Cart";
import { Home } from "./screens/Home";
import { Menu } from "./screens/Menu";
import { Orders } from "./screens/Orders";
import { ProductSheet } from "./screens/ProductSheet";
import { Profile } from "./screens/Profile";
import { Success } from "./screens/Success";
import { useApp, type Screen, type Tab } from "./store";

// админка нужна единицам — грузим отдельным чанком, чтобы первый экран открывался быстрее
const Admin = lazy(() => import("./screens/admin/Admin").then((m) => ({ default: m.Admin })));
const ProductEditor = lazy(() => import("./screens/admin/ProductEditor").then((m) => ({ default: m.ProductEditor })));

function renderScreen(s: Screen) {
  switch (s.name) {
    case "cart":
      return <Cart />;
    case "success":
      return <Success orderId={s.orderId} />;
    case "adminProduct":
      return <ProductEditor id={s.id} />;
  }
}

function renderTab(t: Tab) {
  switch (t) {
    case "home":
      return <Home />;
    case "menu":
      return <Menu />;
    case "orders":
      return <Orders />;
    case "profile":
      return <Profile />;
    case "admin":
      return <Admin />;
  }
}

/** Связка с нативной кнопкой «Назад» Telegram */
function useBackButton() {
  const canGoBack = useApp((s) => s.stack.length > 0 || s.sheetCount > 0);
  const back = useApp((s) => s.back);
  useEffect(() => {
    if (canGoBack) tg.backButton.show();
    else tg.backButton.hide();
  }, [canGoBack]);
  useEffect(() => tg.backButton.onClick(() => (tg.haptic(), back())), [back]);
}

function Loading() {
  return (
    <div className="screen">
      <Skeleton h={44} w="60%" r={12} />
      <div style={{ height: 16 }} />
      <Skeleton h={150} r={24} />
      <div style={{ height: 24 }} />
      <Skeleton h={132} />
      <div style={{ height: 24 }} />
      <div className="grid">
        <Skeleton h={220} />
        <Skeleton h={220} />
      </div>
    </div>
  );
}

export default function App() {
  const ready = useApp((s) => s.me !== null && s.menu !== null);
  const error = useApp((s) => s.error);
  const tab = useApp((s) => s.tab);
  const stack = useApp((s) => s.stack);
  const boot = useApp((s) => s.boot);
  useBackButton();

  useEffect(() => {
    boot().then(() => {
      // диплинки из бота: ?screen=cart|menu|orders|profile|admin
      const screen = tg.startParam("screen");
      const st = useApp.getState();
      if (screen === "cart") st.push({ name: "cart" });
      else if (screen && ["menu", "orders", "profile"].includes(screen)) st.setTab(screen as Tab);
      else if (screen === "admin" && st.me?.is_admin) st.setTab("admin");
    });
  }, [boot]);

  const sheetOpen = useApp((s) => s.sheetCount > 0);
  const [introDone, setIntroDone] = useState(false);
  const finishIntro = useCallback(() => setIntroDone(true), []);
  const navDir = useApp((s) => s.navDir);
  const top = stack[stack.length - 1];
  const key = top ? `${top.name}-${stack.length}` : `tab-${tab}`;

  useEffect(() => {
    scrollToY(0);
  }, [key]);

  return (
    <>
      <ArtDefs />
      <Background />
      {/* вся прокрутка — во внутреннем контейнере (см. lib/scroll.ts) */}
      <div className="scroller" id={SCROLLER_ID}>
      <div className="app">
        {error ? (
          <div className="error-screen">
            <div>
              <h2>Не удалось загрузить</h2>
              <p className="muted">{error}</p>
              <button className="btn" onClick={() => boot()}>
                Повторить
              </button>
            </div>
          </div>
        ) : !ready ? (
          <Loading />
        ) : (
          // экран меняется сразу (без ожидания анимации ухода старого) — тапы не теряются
          // только прозрачность: transform на обёртке ломает sticky и fixed внутри экрана
          // направленный вход: вкладка правее / «вперёд» — справа, левее / «назад» — слева.
          // старый экран не ждёт анимации ухода — тапы не теряются
          <motion.main
            key={key}
            initial={{ opacity: 0, x: navDir * (top ? 56 : 44) }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ x: spring.smooth, opacity: { duration: dur.short, ease: ease.emphasized } }}
          >
            <Suspense fallback={<Loading />}>{top ? renderScreen(top) : renderTab(tab)}</Suspense>
          </motion.main>
        )}
      </div>
      </div>
      {ready && !top && <TabBar />}
      {ready && !top && (tab === "home" || tab === "menu") && (inTelegram ? <CartMainButton /> : <CartBar hidden={sheetOpen} />)}
      {ready && <ProductSheet />}
      <AnimatePresence>{!introDone && <Intro ready={ready || !!error} onDone={finishIntro} />}</AnimatePresence>
      <FlyLayer />
      <Toast />
    </>
  );
}
