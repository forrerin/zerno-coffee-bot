import { motion } from "framer-motion";
import { useState } from "react";
import { PillTabs, TopBar } from "../../components/ui";
import { AdminBroadcasts } from "./Broadcasts";
import { AdminMenu } from "./MenuAdmin";
import { AdminOrders } from "./OrdersAdmin";
import { AdminPromos } from "./Promos";
import { AdminStats } from "./Stats";

const TABS = [
  { id: "orders", title: "Заказы", icon: "receipt" },
  { id: "menu", title: "Меню", icon: "cup" },
  { id: "broadcasts", title: "Рассылки", icon: "megaphone" },
  { id: "promos", title: "Промокоды", icon: "ticket" },
  { id: "stats", title: "Статистика", icon: "chart" },
] as const;

type TabId = (typeof TABS)[number]["id"];

export function Admin() {
  const [tab, setTab] = useState<TabId>("orders");
  return (
    <div className="screen">
      <TopBar title="Админка" sub="Кофейня «Зерно»" right={<span />} />
      <div style={{ marginBottom: 14 }}>
        <PillTabs items={TABS.map((t) => ({ id: t.id, title: t.title, icon: t.icon }))} active={tab} onChange={setTab} />
      </div>
      <motion.div key={tab} initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.2 }}>
        {tab === "orders" && <AdminOrders />}
        {tab === "menu" && <AdminMenu />}
        {tab === "broadcasts" && <AdminBroadcasts />}
        {tab === "promos" && <AdminPromos />}
        {tab === "stats" && <AdminStats />}
      </motion.div>
    </div>
  );
}
