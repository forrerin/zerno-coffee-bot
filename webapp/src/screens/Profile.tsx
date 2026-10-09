import { motion } from "framer-motion";
import { Icon } from "../components/Icon";
import { Toggle, TopBar } from "../components/ui";
import { api } from "../lib/api";
import { plural } from "../lib/format";
import { useApp } from "../store";

function CupIcon({ filled, gift, index }: { filled: boolean; gift: boolean; index: number }) {
  return (
    <motion.svg viewBox="0 0 40 44" initial={{ y: 10, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.1 + index * 0.07, type: "spring", stiffness: 300, damping: 18 }}>
      <path d="M6 14h24l-2.5 22a5 5 0 0 1-5 4.5h-9a5 5 0 0 1-5-4.5L6 14Z" fill={filled ? "#c8793b" : "rgba(246,239,230,.12)"} stroke="#f6efe6" strokeOpacity={filled ? 0 : 0.5} strokeWidth="1.6" strokeDasharray={filled ? undefined : "3 3"} />
      <rect x="4" y="10" width="28" height="4" rx="2" fill={filled ? "#f2dcc0" : "rgba(246,239,230,.25)"} />
      {gift && <path d="M18 22l1.5 3 3.3.5-2.4 2.3.6 3.3-3-1.6-3 1.6.6-3.3-2.4-2.3 3.3-.5Z" fill="#f6efe6" />}
    </motion.svg>
  );
}

export function Profile() {
  const me = useApp((s) => s.me);
  const setTab = useApp((s) => s.setTab);
  const showToast = useApp((s) => s.showToast);

  if (!me) return null;
  const count = Math.min(me.bonus_count, 5);
  const left = 5 - count;

  // переключается сразу; запрос уходит в фоне, при ошибке — откат
  const update = async (data: Parameters<typeof api.updateMe>[0]) => {
    const before = me;
    useApp.setState({ me: { ...me, ...data } as typeof me });
    try {
      await api.updateMe(data);
    } catch (e) {
      useApp.setState({ me: before });
      showToast(e instanceof Error ? e.message : "Не сохранилось", "error");
    }
  };

  return (
    <div className="screen">
      <TopBar title={me.name} sub={me.username ? `@${me.username}` : "Гость кофейни"} />

      <div className="card bonus">
        <div className="row row--between">
          <div>
            <div className="small" style={{ opacity: 0.75 }}>
              Бонусная карта
            </div>
            <h2 style={{ color: "#f6efe6" }}>6-й кофе в подарок</h2>
          </div>
          <Icon name="gift" size={28} />
        </div>
        <div className="cups">
          {Array.from({ length: 6 }, (_, i) => (
            <CupIcon key={i} filled={i < count} gift={i === 5} index={i} />
          ))}
        </div>
        <div className="small" style={{ marginTop: 12, opacity: 0.85 }}>
          {left === 0 ? "Следующий напиток — бесплатно! 🎉" : `Ещё ${left} ${plural(left, ["напиток", "напитка", "напитков"])} до подарка`}
        </div>
      </div>

      <div className="card section" style={{ padding: 4 }}>
        <label className="list-row">
          <span className="plus plus--soft">
            <Icon name="cake" size={18} />
          </span>
          <div className="grow">
            <b>День рождения</b>
            <div className="muted small">Подарим скидку 20% в этот день</div>
          </div>
          <input
            type="date"
            className="input"
            style={{ width: 150, minHeight: 40, padding: "6px 10px" }}
            value={me.birthday ?? ""}
            max={new Date().toISOString().slice(0, 10)}
            onChange={(e) => update({ birthday: e.target.value || null })}
          />
        </label>
        <div className="list-row">
          <span className="plus plus--soft">
            <Icon name="bell" size={18} />
          </span>
          <div className="grow">
            <b>Уведомления</b>
            <div className="muted small">Напоминания, акции и промокоды</div>
          </div>
          <Toggle on={me.notifications_on} onChange={(v) => update({ notifications_on: v })} />
        </div>
      </div>

      {me.is_admin && (
        <button className="card section list-row" style={{ width: "100%", textAlign: "left", padding: 14 }} onClick={() => setTab("admin")}>
          <span className="plus">
            <Icon name="shield" size={18} />
          </span>
          <div className="grow">
            <b>Админ-панель</b>
            <div className="muted small">Заказы, меню, рассылки, статистика</div>
          </div>
          <Icon name="chevron" />
        </button>
      )}

      <p className="muted small" style={{ textAlign: "center", marginTop: 28 }}>
        Кофейня «Зерно» · демо-проект
        <br />
        ул. Утренняя, 7 · 8:00–22:00
      </p>
    </div>
  );
}
