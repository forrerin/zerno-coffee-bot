import { memo, useId } from "react";
import { mediaUrl } from "../lib/api";

/**
 * Иллюстрации позиций меню: вид сверху для чашек, сбоку — для стаканов,
 * мягкая тень «на столе». photo_url вида "art:<key>", иначе — загруженное фото.
 */

const STROKE = "rgba(70,45,28,.18)";

/** Общие фильтры — один раз на документ */
export function ArtDefs() {
  return (
    <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden>
      <defs>
        {/* мягкая тень — градиентом, без filter: SVG-фильтры размытия очень дороги на телефонах */}
        <radialGradient id="art-shadow-g">
          <stop offset="0" stopColor="#2a160a" stopOpacity=".34" />
          <stop offset=".55" stopColor="#2a160a" stopOpacity=".16" />
          <stop offset="1" stopColor="#2a160a" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="art-saucer" cx="45%" cy="40%" r="65%">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="1" stopColor="#efe6dc" />
        </radialGradient>
        <radialGradient id="art-foam" cx="45%" cy="40%" r="60%">
          <stop offset="0" stopColor="#ffffff" stopOpacity=".55" />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
        </radialGradient>
      </defs>
    </svg>
  );
}

type TopArt = "heart" | "tulip" | "rosetta" | "crema" | "cocoa" | "cinnamon" | "lemon" | "leaf" | "berries" | "vanilla" | "none";

interface TopCupProps {
  coffee: string;
  foam: string;
  art: TopArt;
  small?: boolean;
  cup?: string;
}

function TopCup({ coffee, foam, art, small, cup = "#fbf7f2" }: TopCupProps) {
  const k = small ? 0.72 : 1;
  const R = 34 * k;
  const c = 58;
  return (
    <>
      <ellipse cx={c + 6} cy={c + 9} rx={58} ry={56} fill="url(#art-shadow-g)" />
      <circle cx={c} cy={c} r={50} fill="url(#art-saucer)" stroke={STROKE} />
      <circle cx={c} cy={c} r={44} fill="none" stroke={STROKE} />
      <rect x={c + R - 4} y={c - 6 * k} width={22 * k} height={12 * k} rx={6 * k} fill={cup} stroke={STROKE} />
      <circle cx={c + 2} cy={c + 4} r={R + 6} fill="url(#art-shadow-g)" opacity=".6" />
      <circle cx={c} cy={c} r={R} fill={cup} stroke={STROKE} />
      <circle cx={c} cy={c} r={R - 5 * k} fill={coffee} />
      <circle cx={c} cy={c} r={R - 8 * k} fill={foam} />
      {art === "heart" && (
        <path d={`M${c} ${c + 12}c-10-7-15-11-15-17a7.5 7.5 0 0 1 15-2.5 7.5 7.5 0 0 1 15 2.5c0 6-5 10-15 17Z`} fill={coffee} opacity=".9" />
      )}
      {art === "tulip" && (
        <g fill={coffee} opacity=".85">
          <ellipse cx={c} cy={c - 9} rx={10} ry={6} />
          <ellipse cx={c} cy={c + 1} rx={12} ry={5} />
          <ellipse cx={c} cy={c + 10} rx={13} ry={5} />
          <rect x={c - 1} y={c - 4} width={2} height={20} />
        </g>
      )}
      {art === "rosetta" && (
        <g fill="none" stroke={coffee} strokeWidth="3" strokeLinecap="round" opacity=".85">
          {[-12, -6, 0, 6, 12].map((dy, i) => (
            <path key={dy} d={`M${c - 14 + i * 1.5} ${c + dy}q${14 - i * 1.5} ${-7} ${28 - i * 3} 0`} />
          ))}
          <path d={`M${c} ${c - 16}v32`} strokeWidth="1.5" />
        </g>
      )}
      {art === "crema" && (
        <>
          <circle cx={c} cy={c} r={R - 8 * k} fill={foam} />
          <path d={`M${c - 8} ${c - 2}c4 3 12 3 16 -1`} stroke="rgba(255,255,255,.45)" strokeWidth="2" fill="none" strokeLinecap="round" />
          <circle cx={c + 5} cy={c + 5} r={2} fill="rgba(255,255,255,.4)" />
        </>
      )}
      {art === "cocoa" && (
        <>
          <path d={`M${c} ${c + 10}c-8-6-12-9-12-14a6 6 0 0 1 12-2 6 6 0 0 1 12 2c0 5-4 8-12 14Z`} fill={coffee} opacity=".7" />
          {Array.from({ length: 22 }, (_, i) => {
            const a = i * 2.4;
            const r = 6 + (i % 7) * 2.6;
            return <circle key={i} cx={c + Math.cos(a) * r} cy={c + Math.sin(a) * r} r={0.9} fill="#4a2a17" opacity=".6" />;
          })}
        </>
      )}
      {art === "cinnamon" && (
        <>
          <path d={`M${c} ${c + 11}c-9-6-13-10-13-15a6.5 6.5 0 0 1 13-2 6.5 6.5 0 0 1 13 2c0 5-4 9-13 15Z`} fill={coffee} opacity=".55" />
          <g stroke="#8a4b22" strokeWidth="2.4" strokeLinecap="round">
            <path d={`M${c - 14} ${c - 16}l26 30`} />
            <path d={`M${c - 10} ${c - 18}l26 30`} />
          </g>
        </>
      )}
      {art === "vanilla" && (
        <>
          {/* сливочная спираль и стручок ванили */}
          <path
            d={`M${c} ${c}c3 0 4 3 2 5s-7 1-7-4 5-9 11-8 10 7 8 13-10 10-17 8-12-10-9-17`}
            fill="none"
            stroke="#d8b48c"
            strokeWidth="2.6"
            strokeLinecap="round"
          />
          <path d={`M${c + 2} ${c - 20}c6 6 10 14 10 24`} stroke="#3a2214" strokeWidth="3.4" strokeLinecap="round" fill="none" />
          <path d={`M${c + 2} ${c - 20}c6 6 10 14 10 24`} stroke="#5a3a24" strokeWidth="1.2" strokeLinecap="round" fill="none" />
        </>
      )}
      {art === "lemon" && (
        <g>
          <circle cx={c + 6} cy={c - 5} r={11} fill="#f4d35e" stroke="#e2b93b" strokeWidth="1.5" />
          {Array.from({ length: 6 }, (_, i) => (
            <path key={i} d={`M${c + 6} ${c - 5}l${Math.cos((i * Math.PI) / 3) * 9} ${Math.sin((i * Math.PI) / 3) * 9}`} stroke="#fbe9a6" strokeWidth="1.2" />
          ))}
        </g>
      )}
      {art === "leaf" && (
        <g>
          <path d={`M${c - 12} ${c + 8}c0-14 10-22 24-22 0 14-10 22-24 22Z`} fill="#7aa36b" />
          <path d={`M${c - 12} ${c + 8}l20-18`} stroke="#5c8550" strokeWidth="1.2" />
        </g>
      )}
      {art === "berries" && (
        <g>
          {[[-6, -4], [4, -8], [7, 3], [-3, 6], [-10, 4]].map(([dx, dy], i) => (
            <circle key={i} cx={c + dx} cy={c + dy} r={3.6} fill="#f19a2e" stroke="#d97f17" strokeWidth=".8" />
          ))}
          <path d={`M${c + 10} ${c - 12}l6-6`} stroke="#7aa36b" strokeWidth="2" strokeLinecap="round" />
        </g>
      )}
      <circle cx={c} cy={c} r={R - 8 * k} fill="url(#art-foam)" opacity=".5" />
    </>
  );
}

interface GlassProps {
  layers: { color: string; h: number }[]; // снизу вверх, высота в px
  ice?: boolean;
  straw?: string;
  garnish?: "mint" | "orange" | "seeds";
}

function Glass({ layers, ice = true, straw = "#c8793b", garnish }: GlassProps) {
  const id = "g" + useId().replace(/[^a-zA-Z0-9]/g, "");
  const top = 14;
  const bottom = 104;
  const glass = `M34 ${top}h52l-6 ${bottom - top}H40Z`;
  let y = bottom;
  return (
    <>
      <ellipse cx={64} cy={108} rx={36} ry={9} fill="url(#art-shadow-g)" />
      <clipPath id={id}>
        <path d={glass} />
      </clipPath>
      <g clipPath={`url(#${id})`}>
        <rect x="30" y={top} width="60" height={bottom - top} fill="rgba(255,255,255,.35)" />
        {layers.map((l, i) => {
          y -= l.h;
          return <rect key={i} x="30" y={y} width="60" height={l.h + 1} fill={l.color} />;
        })}
        {ice && (
          <g fill="rgba(255,255,255,.55)" stroke="rgba(255,255,255,.8)" strokeWidth="1">
            <rect x="40" y={y + 2} width="15" height="14" rx="3" transform={`rotate(-12 47 ${y + 9})`} />
            <rect x="58" y={y + 8} width="14" height="13" rx="3" transform={`rotate(10 65 ${y + 14})`} />
            <rect x="46" y={y + 22} width="13" height="12" rx="3" transform={`rotate(20 52 ${y + 28})`} />
          </g>
        )}
        {garnish === "seeds" &&
          [[48, 70], [62, 80], [70, 64], [52, 88], [66, 94]].map(([sx, sy], i) => <circle key={i} cx={sx} cy={sy} r="1.6" fill="#3b2a12" />)}
        <path d={`M38 ${top + 4}l4 ${bottom - top - 8}`} stroke="rgba(255,255,255,.6)" strokeWidth="3" strokeLinecap="round" />
      </g>
      <path d={glass} fill="none" stroke="rgba(70,45,28,.25)" strokeWidth="1.5" />
      <path d={`M68 2l-6 ${y - 2}`} stroke={straw} strokeWidth="4" strokeLinecap="round" />
      {garnish === "mint" && (
        <g>
          <path d="M72 18c-2-8 4-14 12-12-1 8-6 12-12 12Z" fill="#6fa36b" />
          <path d="M70 20c-6-4-6-12 0-16 4 5 4 12 0 16Z" fill="#86b97d" />
        </g>
      )}
      {garnish === "orange" && (
        <g>
          <circle cx="82" cy="18" r="10" fill="#f39b2f" stroke="#e07f12" strokeWidth="1.5" />
          <circle cx="82" cy="18" r="6.5" fill="#ffc46b" />
        </g>
      )}
    </>
  );
}

function Plate({ children }: { children: React.ReactNode }) {
  return (
    <>
      <ellipse cx={64} cy={67} rx={60} ry={56} fill="url(#art-shadow-g)" />
      <circle cx={60} cy={60} r={52} fill="url(#art-saucer)" stroke={STROKE} />
      <circle cx={60} cy={60} r={42} fill="none" stroke={STROKE} />
      {children}
    </>
  );
}

const C = {
  coffee: "#7a4a2b",
  dark: "#3d2214",
  foam: "#f2dcc0",
  latte: "#ead2b2",
};

const ARTS: Record<string, () => React.ReactNode> = {
  espresso: () => <TopCup small coffee="#4a2a17" foam="#9b6136" art="crema" />,
  americano: () => <TopCup coffee="#3b2215" foam="#5a3520" art="crema" />,
  cappuccino: () => <TopCup coffee={C.coffee} foam={C.foam} art="heart" />,
  latte: () => <TopCup coffee="#a9714a" foam={C.latte} art="tulip" />,
  flatwhite: () => <TopCup coffee="#8a5532" foam="#e7cba8" art="rosetta" />,
  raf: () => <TopCup coffee="#c9a27e" foam="#f7ead8" art="vanilla" />,
  mocha: () => <TopCup coffee="#5b3220" foam="#d9b796" art="cocoa" />,
  pumpkin: () => <TopCup coffee="#b8682e" foam="#f1c79b" art="cinnamon" />,
  matcha_latte: () => <TopCup coffee="#7f9f4f" foam="#cfe0a8" art="heart" />,
  tea_black: () => <TopCup coffee="#8e3f17" foam="#a5501f" art="lemon" />,
  tea_green: () => <TopCup coffee="#b9b25a" foam="#cfc777" art="leaf" />,
  tea_herbal: () => <TopCup coffee="#e07a1f" foam="#f0a040" art="berries" />,
  iced_latte: () => <Glass layers={[{ color: "#6b3d22", h: 30 }, { color: "#c79a72", h: 18 }, { color: "#f3e3cf", h: 30 }]} />,
  cold_brew: () => <Glass layers={[{ color: "#2e1a0f", h: 74 }]} straw="#6b8f71" />,
  bumble: () => <Glass layers={[{ color: "#f39b2f", h: 40 }, { color: "#c06a2a", h: 10 }, { color: "#3d2214", h: 28 }]} garnish="orange" />,
  lemonade: () => <Glass layers={[{ color: "#f6c34a", h: 74 }]} straw="#6b8f71" garnish="mint" />,
  iced_matcha: () => <Glass layers={[{ color: "#f1ebe0", h: 34 }, { color: "#8fb35a", h: 42 }]} straw="#6b8f71" />,
  cheesecake: () => (
    <Plate>
      <path d="M26 74 84 42l10 8v18L36 96l-10-6Z" fill="#c98b4c" />
      <path d="M26 68 84 36l10 8L36 78Z" fill="#fbecc8" stroke="#e8cf9f" />
      <path d="M26 68v16l10 6V78Z" fill="#f3dcab" />
      <path d="M36 78v12l58-32V44Z" fill="#f7e4b8" />
      <path d="M60 50c4-4 10-3 12 1" stroke="#c0392b" strokeWidth="4" strokeLinecap="round" fill="none" />
    </Plate>
  ),
  croissant: () => (
    <Plate>
      <path d="M22 70c6-24 24-38 38-38s32 14 38 38c-8 6-18 3-21-3-7 6-27 6-34 0-3 6-13 9-21 3Z" fill="#d68b3c" stroke="#b86e25" strokeWidth="1.5" />
      <path d="M40 66c2-12 8-24 20-34M80 66c-2-12-8-24-20-34M60 32v36" stroke="#a85d1d" strokeWidth="2" fill="none" />
      <path d="M44 46c5-6 11-9 16-10" stroke="#f3c07e" strokeWidth="3" strokeLinecap="round" fill="none" opacity=".7" />
    </Plate>
  ),
  cookie: () => (
    <Plate>
      <circle cx="60" cy="60" r="30" fill="#d9a066" stroke="#c0864c" strokeWidth="1.5" />
      {[[48, 50], [66, 46], [72, 64], [54, 70], [60, 58], [44, 64]].map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r={3.6} fill="#4a2a17" />
      ))}
      <path d="M44 42c6-5 14-6 20-4" stroke="#f0c48e" strokeWidth="3" strokeLinecap="round" fill="none" opacity=".7" />
    </Plate>
  ),
  eclair: () => (
    <Plate>
      <rect x="24" y="48" width="72" height="26" rx="13" fill="#d99b55" transform="rotate(-14 60 61)" />
      <rect x="26" y="45" width="68" height="16" rx="8" fill="#b9d18a" transform="rotate(-14 60 53)" />
      {[[38, 54], [52, 50], [66, 46], [80, 42]].map(([x, y], i) => (
        <path key={i} d={`M${x} ${y}l6-2`} stroke="#fff" strokeWidth="2" strokeLinecap="round" />
      ))}
      <circle cx="58" cy="50" r="2" fill="#7a9a4a" />
      <circle cx="72" cy="46" r="2" fill="#7a9a4a" />
    </Plate>
  ),
  syrniki: () => (
    <Plate>
      {[[44, 50], [72, 48], [56, 74]].map(([x, y], i) => (
        <g key={i}>
          <circle cx={x} cy={y} r="15" fill="#d98f42" />
          <circle cx={x} cy={y} r="11" fill="#e9b26a" />
        </g>
      ))}
      <ellipse cx="80" cy="74" rx="10" ry="8" fill="#fff8ee" stroke="#eadbc4" />
      {[[34, 72], [38, 78], [30, 68]].map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="3.5" fill="#c23b3b" />
      ))}
      <path d="M70 30c3-3 7-3 9 0" stroke="#6b8f71" strokeWidth="2.5" fill="none" strokeLinecap="round" />
    </Plate>
  ),
  porridge: () => (
    <Plate>
      <circle cx="60" cy="60" r="34" fill="#fbf7f2" stroke={STROKE} />
      <circle cx="60" cy="60" r="28" fill="#efdcbf" />
      {[[52, 50, "#3c4f9a"], [58, 46, "#3c4f9a"], [66, 52, "#c23b3b"], [70, 60, "#c23b3b"], [62, 58, "#3c4f9a"], [50, 62, "#e3a43b"]].map(([x, y, col], i) => (
        <circle key={i} cx={x as number} cy={y as number} r="3.6" fill={col as string} />
      ))}
      <path d="M44 72c8 4 22 4 30-2" stroke="#e6a93c" strokeWidth="3" fill="none" strokeLinecap="round" />
    </Plate>
  ),
  toast: () => (
    <Plate>
      <rect x="30" y="34" width="60" height="52" rx="14" fill="#d9a066" transform="rotate(-8 60 60)" />
      <rect x="35" y="39" width="50" height="42" rx="10" fill="#f0cf93" transform="rotate(-8 60 60)" />
      <path d="M38 50c10-6 30-8 42 0-2 14-10 22-22 22S38 62 38 50Z" fill="#9cbf5a" />
      <circle cx="62" cy="58" r="12" fill="#fff" />
      <circle cx="63" cy="57" r="5.5" fill="#f4b733" />
      {[[44, 48], [78, 66], [50, 72]].map(([x, y], i) => (
        <path key={i} d={`M${x} ${y}c2-3 5-3 6 0`} stroke="#4f7a3a" strokeWidth="2" fill="none" />
      ))}
    </Plate>
  ),
};

export const ART_KEYS = Object.keys(ARTS);

export const Art = memo(function Art({ src, className = "art" }: { src: string; className?: string }) {
  if (src.startsWith("art:")) {
    const render = ARTS[src.slice(4)] ?? ARTS.cappuccino;
    return (
      <svg className={className} viewBox="0 0 120 120" aria-hidden>
        {render()}
      </svg>
    );
  }
  return <img className="photo" src={mediaUrl(src)} alt="" loading="lazy" />;
});
