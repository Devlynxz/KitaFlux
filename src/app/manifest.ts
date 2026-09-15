import type { MetadataRoute } from "next";

/**
 * Web app manifest.
 *
 * Uses the same product mark as every other surface. `social-avatar.png` (400px)
 * stands in for the 512 slot and `web-logo.png` (200px) for the 192 slot -- both
 * are upscaled slightly by the OS, which is acceptable for a transparent vector
 * -derived mark and avoids inventing artwork that was not supplied.
 *
 * Both are declared `purpose: "any"` rather than `"maskable"`: the mark has no
 * safe-zone padding, so a maskable declaration would let Android crop the peso
 * coin off the corner.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "KitaFlux — Global income. Clear local numbers.",
    short_name: "KitaFlux",
    description:
      "Invoice international clients in USD and keep accurate peso records after forex and platform fees.",
    start_url: "/dashboard",
    display: "standalone",
    background_color: "#F8FAFC",
    theme_color: "#155EEF",
    icons: [
      { src: "/favicon-32.png", sizes: "32x32", type: "image/png", purpose: "any" },
      { src: "/brand/web-logo.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/brand/social-avatar.png", sizes: "512x512", type: "image/png", purpose: "any" },
    ],
  };
}
