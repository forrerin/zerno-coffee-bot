import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { Art } from "../components/Art";
import { Icon } from "../components/Icon";
import { Badges, CoffeeProgress, Price, Skeleton, StatusPill, TopBar } from "../components/ui";
import { api } from "../lib/api";
import { greeting, indexMenu, linesFromOrder, minPrice, reduceMotion, time, unitPrice } from "../lib/format";
import { tg } from "../lib/tg";
import type { Banner, HomeData, Order } from "../lib/types";
import { useApp } from "../store";

function Carousel({ banners }: { banners: Banner[] }) {
  const [i, setI] = useState(0);
  const setTab = useApp((s) => s.setTab);
  const dragged = useRef(false);

  useEffect(() => {
    if (reduceMotion() || banners.length < 2) return;
    const t = setInterval(() => setI((v) => (v + 1) % banners.length), 5000);
    return () => clearInterval(t);
  }, [banners.length, i]);

  const b = banners[i];
  return (
    <div>
      <div className="carousel">
        <AnimatePresence initial={false}>
          <motion.button
            key={b.id}
            className={`banner banner--${b.tone}`}
            style={{ position: "absolute", inset: 0, textAlign: "left" }}
            initial={{ x: "100%", opacity: 0.4 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: "-100%", opacity: 0.4 }}
            transition={{ type: "spring", stiffness: 260, damping: 30 }}
            drag="x"
            dragConstraints={{ left: 0, right: 0 }}
            onDragStart={() => (dragged.current = true)}
            onDragEnd={(_, info) => {
              if (info.offset.x < -50) setI((v) => (v + 1) % banners.length);
              else if (info.offset.x > 50) setI((v) => (v - 1 + banners.length) % banners.length);
              // после свайпа браузер присылает ещё и click — его пропускаем
              setTimeout(() => (dragged.current = false), 50);
            }}
            onClick={() => !dragged.current && setTab("menu")}
          >
            <div className="banner__art">
              <Art src={`art:${b.art}`} />
            </div>
            <h2>{b.title}</h2>
            <p>{b.text}</p>
          </motion.button>
        </AnimatePresence>
      </div>
      <div className="dots">
        {banners.map((x, k) => (
          <span key={x.id} className={k === i ? "on" : ""} />
        ))}
      </div>
    </div>
  );
}

let homeCache: HomeData | null = null;
let lastOrderCache: Order | null = null;

const REPEATABLE = ["paid", "preparing", "ready", "completed"];

/** «Повторить последний заказ» — одна кнопка: позиции заказа кладутся в корзину */
function RepeatLast() {
  const [order, setOrder] = useState<Order | null>(lastOrderCache);
  const replaceCart = useApp((s) => s.replaceCart);
  const push = useApp((s) => s.push);
  const showToast = useApp((s) => s.showToast);
  const menu = useApp((s) => s.menu);
  const { products } = indexMenu(menu);

  useEffect(() => {
    api
      .orders()
      .then((list) => {
        lastOrderCache = list.find((o) => REPEATABLE.includes(o.status)) ?? null;
        setOrder(lastOrderCache);
      })
      .catch(() => undefined);
  }, []);

  if (!order) return null;
  const arts = order.items.slice(0, 3).map((i) => products.get(i.product_id)?.photo_url ?? "art:cappuccino");
  const names = order.items.map((i) => i.name + (i.size ? ` ${i.size}` : "")).join(", ");

  // мгновенно: корзина собирается из позиций заказа на клиенте, без ожидания сервера
  const repeat = () => {
    tg.haptic("medium");
    const lines = linesFromOrder(order, menu);
    if (!lines.length) return showToast("Этих позиций больше нет в меню", "error");
    replaceCart(lines);
    push({ name: "cart" });
  };

  return (
    <motion.div className="card repeat" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ type: "spring", stiffness: 380, damping: 30 }}>
      <div className="repeat__arts">
        {arts.map((a, i) => (
          <div key={i}>
            <Art src={a} />
          </div>
        ))}
      </div>
      <div className="grow">
        <b style={{ fontSize: 15 }}>Повторить последний заказ</b>
        <div className="muted small" style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {names}
        </div>
      </div>
      <button className="btn btn--sm" onClick={repeat} aria-label="Повторить последний заказ">
        <Icon name="repeat" size={18} />
      </button>
    </motion.div>
  );
}

export function Home() {
  const me = useApp((s) => s.me);
  const menu = useApp((s) => s.menu);
  const openProduct = useApp((s) => s.openProduct);
  const addToCart = useApp((s) => s.addToCart);
  const setTab = useApp((s) => s.setTab);
  // последние данные показываем сразу, пока идёт обновление (без серых заглушек при каждом заходе)
  const [data, setData] = useState<HomeData | null>(homeCache);

  useEffect(() => {
    let alive = true;
    const load = () =>
      api
        .home()
        .then((d) => {
          homeCache = d;
          if (alive) setData(d);
        })
        .catch(() => undefined);
    load();
    const t = setInterval(() => document.visibilityState === "visible" && load(), 20_000); // статус активного заказа
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  const { products, modifiers } = indexMenu(menu);
  const name = (tg.firstName() || me?.name || "").split(" ")[0];
  const hit = data?.hit_of_day ? products.get(data.hit_of_day) : undefined;
  const active = data?.active_order;

  return (
    <div className="screen">
      <TopBar title={greeting(name)} sub="Что приготовить сегодня?" />
      <RepeatLast />

      <div className="home-grid">
        <div>
          {data ? <Carousel banners={data.banners} /> : <Skeleton h={150} r={24} />}

          {active && (
            <motion.button className="card section" style={{ padding: 16, width: "100%", textAlign: "left", display: "block" }} onClick={() => setTab("orders")} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
              <div className="row row--between" style={{ marginBottom: 12 }}>
                <div>
                  <h3>Заказ №{active.number}</h3>
                  <div className="muted small">{active.ready_at ? `К ${time(active.ready_at)}` : "Как можно скорее"}</div>
                </div>
                <StatusPill status={active.status} title={active.status_title} />
              </div>
              <CoffeeProgress status={active.status} />
            </motion.button>
          )}
        </div>
        <div>
          <div className="section">
            <div className="section__head">
              <h2>Хит дня</h2>
            </div>
            {hit ? (
              <motion.button
                className="card hit"
                onClick={(e) => {
                  tg.haptic();
                  const r = (e.currentTarget as HTMLElement).querySelector(".hit__art svg, .hit__art img")?.getBoundingClientRect();
                  openProduct(hit.id, r ? { x: r.left, y: r.top, w: r.width, h: r.height } : null);
                }}
              >
                <div className="hit__art">
                  <Art src={hit.photo_url} />
                </div>
                <div className="grow">
                  <Badges badges={hit.badges} />
                  <h3 style={{ marginTop: 6 }}>{hit.name}</h3>
                  <p className="muted small" style={{ margin: "4px 0 8px" }}>
                    {hit.description}
                  </p>
                  <div className="row row--between">
                    <span>
                      {hit.sizes.length > 1 && <span className="muted small">от </span>}
                      <Price value={minPrice(hit)} />
                    </span>
                    <span className="plus">
                      <Icon name="plus" size={18} />
                    </span>
                  </div>
                </div>
              </motion.button>
            ) : (
              <Skeleton h={132} />
            )}
          </div>

          <div className="section">
            <button className="card row" style={{ padding: 16, width: "100%", textAlign: "left" }} onClick={() => setTab("menu")}>
              <span className="plus plus--green">
                <Icon name="cup" size={18} />
              </span>
              <div className="grow">
                <b>Всё меню</b>
                <div className="muted small">Кофе, холодные напитки, чай, десерты и завтраки</div>
              </div>
              <Icon name="chevron" />
            </button>
          </div>
        </div>
      </div>

      {data && data.previous.length > 0 && (
        <div className="section">
          <div className="section__head">
            <h2>Вы заказывали раньше</h2>
          </div>
          <div className="hscroll">
            {data.previous.map((p, i) => {
              const product = products.get(p.product_id);
              if (!product) return null;
              const price = unitPrice(product, p.size, p.modifier_ids, modifiers);
              return (
                <motion.div key={i} className="card prev" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }}>
                  <div style={{ height: 90 }}>
                    <Art src={product.photo_url} />
                  </div>
                  <div style={{ fontWeight: 700, fontSize: 14, marginTop: 6 }}>
                    {p.name} {p.size}
                  </div>
                  <div className="muted small" style={{ minHeight: 18, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {p.modifiers.map((m) => m.name).join(", ") || "Классика"}
                  </div>
                  <div className="row row--between" style={{ marginTop: 8 }}>
                    <Price value={price} />
                    <button
                      className="plus"
                      aria-label="Повторить"
                      onClick={(e) => {
                        tg.haptic("light"); // сильный отклик — при приземлении в корзину
                        const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
                        addToCart({ product_id: p.product_id, size: p.size, modifier_ids: p.modifier_ids, qty: 1 }, { x: r.x + r.width / 2, y: r.y + r.height / 2 }, product.photo_url);
                      }}
                    >
                      <Icon name="repeat" size={17} />
                    </button>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
