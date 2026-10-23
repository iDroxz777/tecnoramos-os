import { useId } from "react";
import { WORDMARK_GROUPS, WORDMARK_HEIGHT, WORDMARK_STROKE, WORDMARK_WIDTH } from "./wordmark-geometry";

const TONES = {
  brand: ["#0B1B44", "#1F4FD6"],
  light: ["#FFFFFF", "#8DADFF"],
} as const;

/** The TECNORAMOS wordmark, drawn inline so it stays sharp at any size. */
export function Wordmark({
  tone = "brand",
  height = 16,
  className,
}: {
  tone?: keyof typeof TONES;
  height?: number;
  className?: string;
}) {
  const clipId = useId();
  const width = (WORDMARK_WIDTH / WORDMARK_HEIGHT) * height;
  return (
    <svg
      className={className}
      width={width}
      height={height}
      viewBox={`0 0 ${WORDMARK_WIDTH} ${WORDMARK_HEIGHT}`}
      role="img"
      aria-label="Tecnoramos"
    >
      <clipPath id={clipId}>
        <rect x="-1" y="0" width={WORDMARK_WIDTH + 2} height={WORDMARK_HEIGHT} />
      </clipPath>
      <g clipPath={`url(#${clipId})`}>
        {WORDMARK_GROUPS.map((group, index) => (
          <g key={index} color={TONES[tone][index]}>
            <g fill="none" stroke="currentColor" strokeWidth={WORDMARK_STROKE} strokeLinejoin="round">
              {group.strokes.map((shape, shapeIndex) => (
                <path key={shapeIndex} transform={`translate(${shape.x} 0)`} d={shape.d} />
              ))}
            </g>
            <g fill="currentColor">
              {group.fills.map((shape, shapeIndex) => (
                <path key={shapeIndex} transform={`translate(${shape.x} 0)`} d={shape.d} />
              ))}
            </g>
          </g>
        ))}
      </g>
    </svg>
  );
}

/** Wordmark plus the product name, used in headers and the sidebar. */
export function BrandLockup({ tone = "brand", compact = false }: { tone?: keyof typeof TONES; compact?: boolean }) {
  return (
    <span className={`brand-lockup brand-lockup-${tone}`}>
      <Wordmark tone={tone} height={compact ? 13 : 15} />
      <span className="brand-lockup-product">Ordens de serviço</span>
    </span>
  );
}

/** Full logo with the tagline, as a static image (the tagline is outlined in the SVG). */
export function FullLogo({ tone = "brand", className }: { tone?: "brand" | "light"; className?: string }) {
  return (
    // The logo is a static SVG asset; next/image adds nothing for vector files here.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      className={className}
      src={tone === "light" ? "/brand/logo-tecnoramos-white.svg" : "/brand/logo-tecnoramos.svg"}
      alt="Tecnoramos — Refrigeração comercial e industrial"
      draggable={false}
    />
  );
}
