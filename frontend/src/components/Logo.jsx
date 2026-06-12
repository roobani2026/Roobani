import React from "react";
import { useTheme } from "../lib/theme";

/* Roobani brand lockups.
 *
 * As of Phase C the primary brand mark is shipped as inline SVG (logo.svg).
 * Why SVG vs the old PNGs:
 *   - 1.5 KB instead of ~700 KB → instant first paint, no decode jank
 *   - Crisp on every DPR, every size, every zoom
 *   - We can recolor for dark mode in CSS, no need for a second asset and
 *     no invert/hue-rotate filter trickery
 *
 * Variants:
 *   <Logo />          — horizontal lockup, for navbar / header
 *   <LogoStacked />   — same lockup; we no longer need a separate stacked
 *                       asset since the SVG keeps its aspect ratio
 *   <LogoMark />      — square monogram, for compact spots and the favicon
 */

function NavyOrCream() {
  const { resolvedTheme } = useTheme();
  return resolvedTheme === "dark" ? "#FAFAF8" : "#1A1F3D";
}

export function Logo({ size = 64, className = "", "data-testid": testId }) {
  const stroke = NavyOrCream();
  const id = React.useId();
  // We re-render the SVG inline (vs <img src=".svg">) so dark mode can swap
  // the wordmark and monogram color in-place without a network round-trip.
  return (
    <span className={`inline-flex items-center ${className}`} data-testid={testId || "logo"}>
      <svg
        viewBox="0 0 320 80"
        height={size}
        width={size * 4}
        role="img"
        aria-label="Roobani"
        style={{ display: "block", maxWidth: "100%" }}
      >
        <title>Roobani</title>
        <path d="M 24 60 L 184 60 L 196 52" stroke="#C9A84C" strokeWidth="3" strokeLinecap="square" fill="none" />
        <g fill={stroke}>
          <rect x="22" y="14" width="6" height="36" />
          <path d="M 28 14 L 50 14 Q 60 14 60 24 Q 60 34 50 34 L 28 34 Z" />
          <path d="M 44 34 L 60 50 L 50 50 L 36 36 Z" />
        </g>
        <text
          x="74"
          y="44"
          fontFamily="Fraunces, 'DM Serif Display', 'Times New Roman', serif"
          fontWeight="600"
          fontSize="34"
          letterSpacing="2.5"
          fill={stroke}
        >ROOBANI</text>
        <desc id={`${id}-d`}>Roobani wordmark with geometric R monogram and gold underline tick.</desc>
      </svg>
    </span>
  );
}

export function LogoStacked({ size = 90, className = "" }) {
  return <Logo size={size * 0.7} className={className} />;
}

export function LogoMark({ size = 28, className = "" }) {
  const fill = NavyOrCream();
  return (
    <span className={`inline-flex ${className}`} aria-hidden={false} role="img" aria-label="Roobani">
      <svg viewBox="0 0 64 64" width={size} height={size}>
        <title>Roobani</title>
        <rect width="64" height="64" fill={fill === "#1A1F3D" ? "#1A1F3D" : "#1A1F3D"} />
        <path d="M 16 50 L 44 50 L 50 44" stroke="#C9A84C" strokeWidth="3" strokeLinecap="square" fill="none" />
        <g fill="#FAFAF8">
          <rect x="16" y="14" width="6" height="30" />
          <path d="M 22 14 L 38 14 Q 46 14 46 22 Q 46 30 38 30 L 22 30 Z" />
          <path d="M 34 30 L 46 44 L 38 44 L 26 32 Z" />
        </g>
      </svg>
    </span>
  );
}
