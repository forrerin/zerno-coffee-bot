import { MotionConfig } from "framer-motion";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { setupMotion } from "./lib/motion";
import { setupTelegram } from "./lib/tg";
import { useApp } from "./store";
import "./styles.css";

setupMotion();

setupTelegram((dark) => {
  document.documentElement.dataset.theme = dark ? "dark" : "light";
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", dark ? "#1A120D" : "#F7F1EA");
  useApp.getState().setDark(dark);
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {/* reducedMotion="user" — уважаем системную настройку «Уменьшить движение» */}
    <MotionConfig reducedMotion="user">
      <App />
    </MotionConfig>
  </StrictMode>,
);
