import { useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "../../components/Icon";
import { Skeleton } from "../../components/ui";
import { api, mediaUrl } from "../../lib/api";
import { dateTime } from "../../lib/format";
import { tg } from "../../lib/tg";
import type { Broadcast, BroadcastsResponse } from "../../lib/types";
import { useApp } from "../../store";

const STATUS: Record<Broadcast["status"], string> = {
  scheduled: "Запланирована",
  sending: "Отправляется",
  done: "Отправлена",
  failed: "Ошибка",
  cancelled: "Отменена",
};

export function AdminBroadcasts() {
  const [data, setData] = useState<BroadcastsResponse | null>(null);
  const [text, setText] = useState("");
  const [photo, setPhoto] = useState<string | null>(null);
  const [buttonText, setButtonText] = useState("☕ Открыть меню");
  const [buttonUrl, setButtonUrl] = useState("");
  const [segment, setSegment] = useState<Broadcast["segment"]>("all");
  const [later, setLater] = useState(false);
  const [when, setWhen] = useState("");
  const [sending, setSending] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const showToast = useApp((s) => s.showToast);

  const load = useCallback(() => api.admin.broadcasts().then(setData).catch(() => undefined), []);
  useEffect(() => {
    load();
    const t = setInterval(load, 4000); // прогресс отправки
    return () => clearInterval(t);
  }, [load]);

  const upload = async (file: File) => {
    try {
      setPhoto((await api.admin.upload(file)).url);
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Не загрузилось", "error");
    }
  };

  const submit = async () => {
    setSending(true);
    try {
      await api.admin.createBroadcast({
        text: text.trim(),
        photo,
        button_text: buttonText.trim() || null,
        button_url: buttonUrl.trim() || null,
        segment,
        scheduled_at: later && when ? new Date(when).toISOString() : null,
      });
      tg.notify("success");
      showToast(later ? "Рассылка запланирована" : "Рассылка поставлена в очередь");
      setText("");
      setPhoto(null);
      load();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Ошибка", "error");
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <div className="card" style={{ padding: 14 }}>
        <h3 style={{ marginBottom: 10 }}>Новая рассылка</h3>
        <label className="field">
          <span>Текст (поддерживается HTML: &lt;b&gt;, &lt;i&gt;)</span>
          <textarea className="input" rows={4} value={text} onChange={(e) => setText(e.target.value)} maxLength={1024} placeholder="Сегодня −20% на все холодные напитки!" />
        </label>

        <div className="row" style={{ marginBottom: 14 }}>
          {photo ? (
            <>
              <img src={mediaUrl(photo)} alt="" style={{ width: 64, height: 64, objectFit: "cover", borderRadius: 12 }} />
              <button className="btn btn--sm btn--quiet" onClick={() => setPhoto(null)}>
                Убрать фото
              </button>
            </>
          ) : (
            <button className="btn btn--sm btn--ghost" onClick={() => fileRef.current?.click()}>
              <Icon name="image" size={18} /> Добавить фото
            </button>
          )}
          <input ref={fileRef} type="file" hidden accept="image/png,image/jpeg,image/webp" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
        </div>

        <div className="row">
          <label className="field grow">
            <span>Текст кнопки</span>
            <input className="input" value={buttonText} onChange={(e) => setButtonText(e.target.value)} maxLength={64} />
          </label>
        </div>
        <label className="field">
          <span>Ссылка кнопки (пусто — откроется Mini App)</span>
          <input className="input" value={buttonUrl} onChange={(e) => setButtonUrl(e.target.value)} placeholder="https://…" />
        </label>

        <div className="field">
          <span>Сегмент</span>
          <div className="opts">
            {data?.segments.map((s) => (
              <button key={s.id} className={`opt ${segment === s.id ? "opt--on" : ""}`} onClick={() => (tg.select(), setSegment(s.id))}>
                <span className="opt__mark">{segment === s.id && <Icon name="check" size={14} stroke={3} />}</span>
                <span className="grow" style={{ fontWeight: 600 }}>
                  {s.title}
                </span>
                <span className="muted small num">{s.count} чел.</span>
              </button>
            ))}
          </div>
        </div>

        <div className="opts opts--2" style={{ marginBottom: 12 }}>
          <button className={`opt ${!later ? "opt--on" : ""}`} onClick={() => setLater(false)}>
            <span className="opt__mark">{!later && <Icon name="check" size={14} stroke={3} />}</span>
            <span className="small" style={{ fontWeight: 600 }}>
              Сейчас
            </span>
          </button>
          <button className={`opt ${later ? "opt--on" : ""}`} onClick={() => setLater(true)}>
            <span className="opt__mark">{later && <Icon name="check" size={14} stroke={3} />}</span>
            <span className="small" style={{ fontWeight: 600 }}>
              Отложить
            </span>
          </button>
        </div>
        {later && <input className="input" type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} style={{ marginBottom: 12 }} />}

        <button className="btn btn--block" disabled={!text.trim() || sending || (later && !when)} onClick={submit}>
          <Icon name="megaphone" /> {later ? "Запланировать" : "Отправить"}
        </button>
        <div className="muted small" style={{ marginTop: 8, textAlign: "center" }}>
          Отправка пачками до 25 сообщений в секунду
        </div>
      </div>

      <div className="section stack">
        {!data && <Skeleton h={120} />}
        {data?.items.map((b) => {
          const pct = b.total_count ? Math.round(((b.sent_count + b.failed_count) / b.total_count) * 100) : b.status === "done" ? 100 : 0;
          return (
            <div key={b.id} className="card" style={{ padding: 14 }}>
              <div className="row row--between">
                <b>{STATUS[b.status]}</b>
                <span className="muted small">{dateTime(b.scheduled_at ?? b.created_at)}</span>
              </div>
              <div className="small" style={{ margin: "6px 0 10px", whiteSpace: "pre-wrap" }} dangerouslySetInnerHTML={{ __html: sanitize(b.text) }} />
              {b.status !== "scheduled" && b.status !== "cancelled" && (
                <>
                  <div className="coffee-bar" style={{ height: 8 }}>
                    <div className="coffee-bar__fill" style={{ width: `${pct}%` }} />
                  </div>
                  <div className="muted small" style={{ marginTop: 6 }}>
                    Доставлено {b.sent_count} из {b.total_count}
                    {b.failed_count ? ` · ошибок ${b.failed_count}` : ""}
                  </div>
                </>
              )}
              {b.status === "scheduled" && (
                <button className="btn btn--sm btn--quiet" onClick={() => api.admin.cancelBroadcast(b.id).then(load)}>
                  Отменить
                </button>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}

/** Разрешаем только безопасные теги Telegram-разметки */
function sanitize(html: string): string {
  const escaped = html.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return escaped.replace(/&lt;(\/?)(b|i|u|s|code)&gt;/g, "<$1$2>");
}
