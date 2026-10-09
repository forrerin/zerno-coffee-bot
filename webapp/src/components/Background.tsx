import { memo } from "react";

/**
 * Фон под стеклом: тёплые «кофейные» пятна (эспрессо, карамель, пенка, акцент) и лёгкий шум.
 * Фон неподвижен намеренно: если он движется, телефон каждый кадр заново размывает
 * все стеклянные панели поверх него — это главный источник лагов.
 */
export const Background = memo(function Background() {
  return (
    <div className="bg" aria-hidden>
      <div className="bg__blob bg__blob--espresso" />
      <div className="bg__blob bg__blob--caramel" />
      <div className="bg__blob bg__blob--foam" />
      <div className="bg__blob bg__blob--accent" />
      <div className="bg__noise" />
    </div>
  );
});
