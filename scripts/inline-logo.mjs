// Regenerates src/server/pdf/logo-data.ts from the brand asset.
// Run after replacing KitaFlux-assets/web-logo.png.
import { readFileSync, writeFileSync } from "node:fs";

const png = readFileSync("KitaFlux-assets/web-logo.png");

writeFileSync(
  "src/server/pdf/logo-data.ts",
  `// GENERATED FILE - do not edit by hand.
//
// KitaFlux-assets/web-logo.png, inlined as a data URI.
//
// The invoice PDF is rendered inside a serverless function, where reading from
// \`public/\` is not guaranteed and fetching over the network is a failure mode
// on the one document a client actually receives. Inlining costs ~26KB in the
// server bundle and makes the render unconditional.
//
// Regenerate with: node scripts/inline-logo.mjs
export const LOGO_PNG_DATA_URI =
  "data:image/png;base64,${png.toString("base64")}";
`,
);

console.log("Regenerated src/server/pdf/logo-data.ts");
