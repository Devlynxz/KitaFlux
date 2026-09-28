import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans, Plus_Jakarta_Sans } from "next/font/google";
import { headers } from "next/headers";

import "./globals.css";

/**
 * Interface and figure faces.
 *
 * IBM Plex Sans for the UI, IBM Plex Mono for money. They are siblings from one
 * superfamily, so the label above a figure and the figure itself share
 * proportions and terminals instead of merely coexisting.
 *
 * Plex Mono is the load-bearing half: a currency column only reads as a column
 * if every digit occupies the same width, so the figures are set in the mono
 * face with tnum on rather than in the interface face. `display: swap` so a
 * slow font never blanks a page of numbers.
 *
 * The faces are named by role, not by vendor: swapping either one later should
 * not mean renaming a variable in three files.
 */
const sans = IBM_Plex_Sans({
  subsets: ["latin"],
  variable: "--font-sans-face",
  display: "swap",
  weight: ["400", "500", "600", "700"],
});

const mono = IBM_Plex_Mono({
  subsets: ["latin"],
  variable: "--font-mono-face",
  display: "swap",
  weight: ["400", "500", "600"],
});

/**
 * Wordmark face.
 *
 * A wordmark set in the same face as the surrounding interface reads as a
 * heading, not as a logo -- the lockup only looks designed when its letterforms
 * are visibly not body text. That separation is why the mark keeps its own face
 * while the UI moved to Plex.
 *
 * Plus Jakarta Sans at 800 was chosen over the alternatives because:
 *   - its K has a high junction and a straight, confident leg, which echoes the
 *     geometry of the K in the icon rather than fighting it;
 *   - the single-storey-feeling a and the angular x give "KitaFlux" a distinct
 *     silhouette at 16px, where a neutral grotesque reads as generic;
 *   - it is a humanist geometric, so it stays warm next to a gradient mark --
 *     and it now carries more of the identity, because Plex is the colder,
 *     more engineered face it sits beside.
 *
 * Since the brand redesign it also sets every h1-h3 (see globals.css): its
 * rounded terminals are the closest type gets to the ribbon in the mark, so
 * headings carry the identity while Plex keeps body, controls and figures
 * sober. 600 and 700 are for headings, 800 for the wordmark and hero.
 *
 * Loaded as the variable font (no `weight` list): one file covers 600-800, and
 * listing static weights here made Turbopack's font loader fail the build.
 */
const display = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-display-face",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"),
  title: {
    default: "KitaFlux — Global income. Clear local numbers.",
    template: "%s · KitaFlux",
  },
  description:
    "Invoice international clients in USD, record what actually landed in pesos after forex and platform fees, and keep quarter-ready records for BIR filing.",
  icons: {
    // The supplied PNG favicon set. There is deliberately no SVG fallback: the
    // old geometric mark is retired, and one brand means one mark everywhere.
    icon: [
      { url: "/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon-16.png", sizes: "16x16", type: "image/png" },
    ],
    apple: "/brand/web-logo.png",
  },
  openGraph: {
    title: "KitaFlux — Global income. Clear local numbers.",
    description:
      "Invoice international clients in USD and keep accurate peso records after forex and platform fees.",
    type: "website",
    siteName: "KitaFlux",
    images: [{ url: "/brand/og-image.png", width: 1200, height: 630, alt: "KitaFlux" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "KitaFlux — Global income. Clear local numbers.",
    description:
      "Invoice international clients in USD and keep accurate peso records after forex and platform fees.",
    images: ["/brand/og-image.png"],
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F5F8FD" },
    { media: "(prefers-color-scheme: dark)", color: "#060D1E" },
  ],
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Set by src/proxy.ts. The policy's script-src uses 'strict-dynamic', so an
  // inline script without this response's nonce is blocked outright.
  const nonce = (await headers()).get("x-nonce") ?? undefined;

  return (
    // The next/font variable classes go on <html>, not <body>. They define
    // --font-*-face, and the stacks in globals.css that consume them are
    // declared on :root -- so if the faces were scoped to <body> the var()
    // would be unresolvable at :root, making the whole stack
    // guaranteed-invalid and silently falling every surface back to a system
    // font. Defining the faces at or above their consumer is the fix.
    <html
      lang="en"
      className={`${sans.variable} ${mono.variable} ${display.variable}`}
      suppressHydrationWarning
    >
      <head>
        {/* Applies the stored theme before first paint. Without this the page
            flashes light before hydration on a dark-mode device. */}
        <script
          nonce={nonce}
          // Browsers hide a nonce from the DOM after parsing (the attribute
          // reads back empty), which React would otherwise report as a
          // hydration mismatch.
          suppressHydrationWarning
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem("kitaflux-theme");var d=t?t==="dark":window.matchMedia("(prefers-color-scheme: dark)").matches;if(d)document.documentElement.classList.add("dark")}catch(e){}})();`,
          }}
        />
      </head>
      <body className="antialiased">{children}</body>
    </html>
  );
}
