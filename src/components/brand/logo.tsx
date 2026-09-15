import Image from "next/image";

import { cn } from "@/lib/cn";

/**
 * The KitaFlux lockup.
 *
 * One mark, everywhere: KitaFlux-assets/web-logo.png. The same artwork backs the
 * favicon, the OG card, the email header, the social avatar and the invoice PDF,
 * so the product looks like one thing across every surface.
 *
 * The wordmark stays live text rather than baked into the image. Text stays
 * crisp at any size, follows the theme's ink colour, remains selectable and
 * readable to assistive tech, and costs nothing to render -- a raster wordmark
 * would need a light and a dark variant and would still blur on a 1x display.
 *
 * Typography: Plus Jakarta Sans 800, set tight. See the note in app/layout.tsx
 * for why the mark uses a display face while the UI stays on Inter.
 *
 * Two details make it read as a designed lockup rather than bold text:
 *   - negative tracking that scales with size (large type needs proportionally
 *     tighter spacing than small type to hold together optically);
 *   - the icon sized to the wordmark's cap height, not to its em box, so the
 *     mark and the letterforms sit on a shared optical baseline.
 */

type LogoSize = "sm" | "md" | "lg";

const SIZES: Record<LogoSize, { icon: string; text: string; gap: string; tracking: string }> = {
  // Sidebar and mobile header.
  sm: { icon: "size-7", text: "text-[0.9375rem]", gap: "gap-2", tracking: "-0.02em" },
  // Default: auth pages, landing header, footer.
  md: { icon: "size-8", text: "text-[1.0625rem]", gap: "gap-2", tracking: "-0.025em" },
  // Landing hero and anywhere the mark is the subject.
  lg: { icon: "size-11", text: "text-2xl", gap: "gap-2.5", tracking: "-0.035em" },
};

export function LogoIcon({ className }: { className?: string }) {
  return (
    <Image
      src="/brand/web-logo.png"
      alt=""
      width={200}
      height={200}
      // Decorative: `Logo` names itself through the wordmark text, and callers
      // that use the icon alone label the surrounding control.
      aria-hidden
      priority
      className={cn("size-8", className)}
    />
  );
}

export function Logo({
  size = "md",
  className,
}: {
  size?: LogoSize;
  className?: string;
}) {
  const s = SIZES[size];

  return (
    <span className={cn("inline-flex items-center", s.gap, className)}>
      <LogoIcon className={s.icon} />
      <span
        className={cn("font-extrabold leading-none text-[var(--color-ink)]", s.text)}
        style={{
          fontFamily: "var(--font-display-stack)",
          letterSpacing: s.tracking,
          // Plus Jakarta's default figures are not needed here, but disabling
          // contextual alternates keeps the K-i pair from shifting at 800.
          fontFeatureSettings: '"calt" 0',
        }}
      >
        Kita<span className="text-[var(--color-primary)]">Flux</span>
      </span>
    </span>
  );
}
