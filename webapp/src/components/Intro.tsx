import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import { ease, prefersReducedMotion, spring } from "../lib/motion";

const SEEN_KEY = "zerno-intro-seen";

function seenBefore(): boolean {
  try {
    return localStorage.getItem(SEEN_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * Брендовое интро ≤1.2 с: чашка наполняется, поднимается пар, собирается «Зерно» —
 * и плавно перетекает в приложение. Повторные открытия — короткая версия.
 * Закрывает собой время загрузки данных, но не держит дольше, чем нужно.
 */
export function Intro({ ready, onDone }: { ready: boolean; onDone: () => void }) {
  const [short] = useState(() => seenBefore() || prefersReducedMotion());
  const minTime = short ? 450 : 1150;
  const [minPassed, setMinPassed] = useState(false);

  useEffect(() => {
    const t = window.setTimeout(() => setMinPassed(true), minTime);
    try {
      localStorage.setItem(SEEN_KEY, "1");
    } catch {
      /* приватный режим */
    }
    return () => window.clearTimeout(t);
  }, [minTime]);

  useEffect(() => {
    if (ready && minPassed) onDone();
  }, [ready, minPassed, onDone]);

  const k = short ? 0.4 : 1; // короткая версия — всё быстрее
  const letters = "Зерно".split("");

  return (
    <motion.div
      className="intro"
      initial={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 1.04, transition: { duration: 0.35, ease: ease.emphasized } }}
      aria-hidden
    >
      <svg viewBox="0 0 120 120" width="112" height="112">
        <defs>
          <clipPath id="intro-cup">
            <path d="M30 46h56l-5 40a12 12 0 0 1-12 10H47a12 12 0 0 1-12-10l-5-40Z" />
          </clipPath>
          <linearGradient id="intro-coffee" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#c88a52" />
            <stop offset="1" stopColor="#6f4428" />
          </linearGradient>
        </defs>
        <g clipPath="url(#intro-cup)">
          <motion.rect
            x="24"
            width="70"
            height="60"
            fill="url(#intro-coffee)"
            initial={{ y: 100 }}
            animate={{ y: 50 }}
            transition={{ duration: 0.75 * k, ease: ease.emphasized }}
          />
        </g>
        <path d="M30 46h56l-5 40a12 12 0 0 1-12 10H47a12 12 0 0 1-12-10l-5-40Z" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinejoin="round" />
        <path d="M85 56h6a10 10 0 0 1 0 20h-8" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" />
        {[48, 58, 68].map((x, i) => (
          <motion.path
            key={x}
            d={`M${x} 38c-5-5 5-9 0-14s5-9 0-14`}
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
            initial={{ pathLength: 0, opacity: 0 }}
            animate={{ pathLength: 1, opacity: [0, 0.75, 0.55] }}
            transition={{ delay: (0.5 + i * 0.1) * k, duration: 0.55 * k }}
          />
        ))}
      </svg>
      <div className="intro__word">
        {letters.map((ch, i) => (
          <motion.span
            key={i}
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...spring.smooth, delay: (0.35 + i * 0.05) * k }}
          >
            {ch}
          </motion.span>
        ))}
      </div>
    </motion.div>
  );
}
