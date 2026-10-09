import { AnimatePresence, motion, useMotionValue, useTransform } from "framer-motion";
import { useEffect, useMemo, useState } from "react";
import { Art } from "../components/Art";
import { Icon } from "../components/Icon";
import { Empty, MainButton, PillTabs, Qty, Sheet, Spinner, TopBar } from "../components/ui";
import { api, ApiError } from "../lib/api";
import { dur, ease, spring } from "../lib/motion";
import { indexMenu, plural, rub, toStars, unitPrice } from "../lib/format";
import { tg } from "../lib/tg";
import type { CartLine, Order, Quote } from "../lib/types";
import { useApp } from "../store";

function slots(): string[] {
  const res: string[] = [];
  const d = new Date(Date.now() + 20 * 60_000);
  d.setMinutes(Math.ceil(d.getMinutes() / 15) * 15, 0, 0);
  while (res.length < 24 && d.getHours() < 22 && d.getHours() >= 8) {
    res.push(d.toTimeString().slice(0, 5));
    d.setMinutes(d.getMinutes() + 15);
  }
  return res;
}

function CartRow({ line }: { line: CartLine }) {
  const menu = useApp((s) => s.menu);
  const setQty = useApp((s) => s.setQty);
  const remove = useApp((s) => s.removeLine);
  const { products, modifiers } = indexMenu(menu);
  const x = useMotionValue(0);
  const deleteOpacity = useTransform(x, [-120, -30, 0], [1, 0.6, 0]);
  const p = products.get(line.product_id);
  if (!p) return null;
  const mods = line.modifier_ids.map((id) => modifiers.get(id)?.name).filter(Boolean);

  return (
    // удалённая строка уезжает влево и гаснет; соседние съезжают на её место через FLIP (layout)
    <motion.div
      className="cline-wrap"
      layout
      exit={{ opacity: 0, x: -80, scale: 0.94, transition: { duration: dur.short, ease: ease.exit } }}
      transition={spring.smooth}
    >
      <motion.div className="cline-delete" style={{ opacity: deleteOpacity }}>
        <Icon name="trash" />
      </motion.div>
      <motion.div
        className="card cline"
        style={{ x }}
        drag="x"
        dragDirectionLock
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={{ left: 0.8, right: 0 }}
        onDragEnd={(_, info) => {
          if (info.offset.x < -100) {
            tg.notify("warning");
            remove(line.key);
          }
        }}
      >
        <div className="cline__art">
          <Art src={p.photo_url} />
        </div>
        <div className="grow">
          <b>
            {p.name} {line.size}
          </b>
          <div className="muted small">{mods.join(", ") || (p.sizes.length ? "Классика" : " ")}</div>
          <div className="row row--between" style={{ marginTop: 6 }}>
            <span className="price">{rub(unitPrice(p, line.size, line.modifier_ids, modifiers) * line.qty)}</span>
            <Qty value={line.qty} min={0} onChange={(v) => setQty(line.key, v)} />
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

function PaymentSheet({ order, onClose }: { order: Order | null; onClose: () => void }) {
  const [method, setMethod] = useState<"card" | "stars">("card");
  const [paying, setPaying] = useState(false);
  const showToast = useApp((s) => s.showToast);

  const pay = async () => {
    if (!order || paying) return;
    setPaying(true);
    try {
      await new Promise((r) => setTimeout(r, 500)); // имитация платёжного шлюза
      await api.pay(order.id, method);
      // haptic success — на экране успеха, в момент когда чашка наполнилась
      useApp.setState({ cart: [], tab: "home", stack: [{ name: "success", orderId: order.id }] });
      useApp.getState().refreshMe();
    } catch (e) {
      tg.notify("error");
      showToast(e instanceof Error ? e.message : "Оплата не прошла", "error");
    } finally {
      setPaying(false);
    }
  };

  return (
    <Sheet open={!!order} onClose={() => !paying && onClose()}>
      {order && (
        <div className="stack">
          <h2>Оплата заказа №{order.number}</h2>
          <div className="demo-note">Демо-режим: реальные деньги не списываются, оплата имитируется.</div>

          <button className={`pay-method ${method === "card" ? "pay-method--on" : ""}`} onClick={() => (tg.select(), setMethod("card"))}>
            <span className="plus">
              <Icon name="card" size={18} />
            </span>
            <span className="grow">
              <b>Банковская карта</b>
              <div className="muted small">Тестовая карта ЮKassa</div>
            </span>
            <span className="price">{rub(order.total)}</span>
          </button>
          <button className={`pay-method ${method === "stars" ? "pay-method--on" : ""}`} onClick={() => (tg.select(), setMethod("stars"))}>
            <span className="plus plus--soft">
              <Icon name="star" size={18} />
            </span>
            <span className="grow">
              <b>Telegram Stars</b>
              <div className="muted small">Оплата звёздами</div>
            </span>
            <span className="price">⭐ {toStars(order.total)}</span>
          </button>

          <AnimatePresence mode="wait">
            {method === "card" ? (
              <motion.div key="card" className="test-card" initial={{ opacity: 0, rotateX: -30 }} animate={{ opacity: 1, rotateX: 0 }} exit={{ opacity: 0 }}>
                <div className="small" style={{ opacity: 0.7 }}>
                  ТЕСТОВАЯ КАРТА
                </div>
                <div style={{ fontSize: 20, margin: "18px 0 10px", fontWeight: 700 }}>5555 5555 5555 4477</div>
                <div className="row row--between small">
                  <span>ZERNO DEMO</span>
                  <span>12/30 · CVC 000</span>
                </div>
              </motion.div>
            ) : (
              <motion.div key="stars" className="card" style={{ padding: 16, textAlign: "center" }} initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}>
                <div style={{ fontSize: 36 }}>⭐</div>
                <b>{toStars(order.total)} Stars</b>
                <div className="muted small">Будет списано с демо-баланса</div>
              </motion.div>
            )}
          </AnimatePresence>
          <MainButton text={method === "card" ? `Оплатить ${rub(order.total)}` : `Оплатить ⭐ ${toStars(order.total)}`} onClick={pay} loading={paying} />
        </div>
      )}
    </Sheet>
  );
}

export function Cart() {
  const cart = useApp((s) => s.cart);
  const setTab = useApp((s) => s.setTab);
  const showToast = useApp((s) => s.showToast);
  const me = useApp((s) => s.me);
  const menu = useApp((s) => s.menu);

  const [promo, setPromo] = useState("");
  const [appliedPromo, setAppliedPromo] = useState("");
  const [asap, setAsap] = useState(true);
  const times = useMemo(slots, []);
  const [readyAt, setReadyAt] = useState(times[1] ?? times[0] ?? "");
  const [comment, setComment] = useState("");
  // пересчёт сервера + для какой корзины он сделан: устаревший ответ не показываем
  const [quoted, setQuoted] = useState<{ key: string; quote: Quote } | null>(null);
  const [creating, setCreating] = useState(false);
  const [order, setOrder] = useState<Order | null>(null);

  const quoteKey = JSON.stringify([cart.map((l) => [l.key, l.qty]), appliedPromo]);
  const quote = quoted?.key === quoteKey ? quoted.quote : null;

  useEffect(() => {
    if (!cart.length) return;
    let alive = true;
    const key = quoteKey;
    const t = setTimeout(() => {
      api
        .quote(cart, appliedPromo)
        .then((q) => {
          if (!alive) return;
          setQuoted({ key, quote: q });
          if (q.promo_error) {
            showToast(q.promo_error, "error");
            setAppliedPromo("");
          }
        })
        .catch((e) => alive && showToast(e.message, "error"));
    }, 250);
    return () => {
      alive = false;
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quoteKey]);

  const count = cart.reduce((n, l) => n + l.qty, 0);
  // предварительная сумма на клиенте: кнопка оплаты не ждёт ответа сервера (итог всё равно считает сервер)
  const { products, modifiers } = indexMenu(menu);
  const estimate = cart.reduce((sum, l) => {
    const p = products.get(l.product_id);
    return p ? sum + unitPrice(p, l.size, l.modifier_ids, modifiers) * l.qty : sum;
  }, 0);

  const checkout = async () => {
    if (creating) return;
    setCreating(true);
    try {
      const o = await api.createOrder(cart, { promo_code: appliedPromo, ready_at: asap ? null : readyAt, comment });
      setOrder(o);
    } catch (e) {
      tg.notify("error");
      showToast(e instanceof ApiError ? e.message : "Не удалось оформить заказ", "error");
    } finally {
      setCreating(false);
    }
  };

  if (!cart.length) {
    return (
      <div className="screen screen--plain">
        <TopBar back title="Корзина" right={<span />} />
        <Empty
          art="art:cappuccino"
          title="Корзина пуста"
          text="Загляните в меню — там тёплый капучино и свежие круассаны"
          action={
            <button className="btn" style={{ marginTop: 16 }} onClick={() => setTab("menu")}>
              Открыть меню
            </button>
          }
        />
      </div>
    );
  }

  const total = quote?.total ?? estimate;
  const bonusReady = (me?.bonus_count ?? 0) >= 5;

  return (
    <div className="screen screen--plain">
      <TopBar back title="Корзина" sub={`${count} ${plural(count, ["позиция", "позиции", "позиций"])} · смахните влево, чтобы удалить`} right={<span />} />

      <div className="stack">
        <AnimatePresence initial={false} mode="popLayout">
          {cart.map((l) => (
            <CartRow key={l.key} line={l} />
          ))}
        </AnimatePresence>
      </div>

      {bonusReady && (
        <div className="card row section" style={{ padding: 14 }}>
          <span className="plus plus--green">
            <Icon name="gift" size={18} />
          </span>
          <div className="grow small">
            <b>6-й напиток — в подарок!</b>
            <div className="muted">Самый недорогой напиток в заказе будет бесплатным</div>
          </div>
        </div>
      )}

      <div className="section">
        <h3 style={{ marginBottom: 10 }}>Промокод</h3>
        <div className="row">
          <input className="input grow" value={promo} onChange={(e) => setPromo(e.target.value.toUpperCase())} placeholder="Например, ZERNO10" maxLength={32} />
          {appliedPromo ? (
            <button className="btn btn--quiet" onClick={() => (setAppliedPromo(""), setPromo(""))}>
              Убрать
            </button>
          ) : (
            <button className="btn btn--ghost" disabled={!promo.trim()} onClick={() => (tg.haptic(), setAppliedPromo(promo.trim()))}>
              Применить
            </button>
          )}
        </div>
      </div>

      <div className="section">
        <h3 style={{ marginBottom: 10 }}>Время готовности</h3>
        <div className="opts opts--2">
          <button className={`opt ${asap ? "opt--on" : ""}`} onClick={() => (tg.select(), setAsap(true))}>
            <span className="opt__mark">{asap && <Icon name="check" size={14} stroke={3} />}</span>
            <span className="small" style={{ fontWeight: 600 }}>
              Как можно скорее
            </span>
          </button>
          <button className={`opt ${!asap ? "opt--on" : ""}`} onClick={() => (tg.select(), setAsap(false))} disabled={!times.length}>
            <span className="opt__mark">{!asap && <Icon name="check" size={14} stroke={3} />}</span>
            <span className="small" style={{ fontWeight: 600 }}>
              Ко времени
            </span>
          </button>
        </div>
        <AnimatePresence>
          {!asap && (
            <motion.div style={{ marginTop: 10 }} initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}>
              <PillTabs items={times.map((t) => ({ id: t, title: <span className="num">{t}</span> }))} active={readyAt} onChange={setReadyAt} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="section">
        <h3 style={{ marginBottom: 10 }}>Комментарий бариста</h3>
        <textarea className="input" value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Например: погорячее, без крышки" maxLength={300} rows={2} />
      </div>

      <div className="card section" style={{ padding: 16 }}>
        {quote ? (
          <>
            <div className="summary-row">
              <span className="muted">Сумма</span>
              <span className="num">{rub(quote.subtotal)}</span>
            </div>
            {quote.bonus_discount > 0 && (
              <div className="summary-row">
                <span className="muted">Бонусный напиток</span>
                <span className="num" style={{ color: "var(--green)" }}>
                  −{rub(quote.bonus_discount)}
                </span>
              </div>
            )}
            {quote.promo_discount > 0 && (
              <div className="summary-row">
                <span className="muted">Промокод {quote.promo_code}</span>
                <span className="num" style={{ color: "var(--green)" }}>
                  −{rub(quote.promo_discount)}
                </span>
              </div>
            )}
            <div className="summary-row summary-row--total">
              <span>Итого</span>
              <motion.span key={quote.total} initial={{ scale: 1.15 }} animate={{ scale: 1 }} className="num">
                {rub(quote.total)}
              </motion.span>
            </div>
          </>
        ) : (
          <>
            <div className="summary-row">
              <span className="muted">Сумма</span>
              <span className="num">{rub(estimate)}</span>
            </div>
            <div className="summary-row summary-row--total">
              <span>Итого</span>
              <span className="row" style={{ gap: 8 }}>
                <span style={{ color: "var(--accent)" }}>
                  <Spinner size={16} />
                </span>
                <span className="num">{rub(estimate)}</span>
              </span>
            </div>
          </>
        )}
      </div>

      <MainButton text={`Оплатить ${rub(total)}`} onClick={checkout} loading={creating} visible={!order} />
      <PaymentSheet
        order={order}
        onClose={() => {
          // передумал платить — отменяем черновик, чтобы не копить неоплаченные заказы
          if (order) api.cancel(order.id).catch(() => undefined);
          setOrder(null);
        }}
      />
    </div>
  );
}
