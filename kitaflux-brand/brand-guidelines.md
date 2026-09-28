# KitaFlux Brand Guidelines

## Brand
**Official product name:** KitaFlux  
**Short name:** KitaFlux  
**Tagline:** Global income. Clear local numbers.

### Positioning
A modern financial workspace for Filipino freelancers who earn globally but need clear, accurate local PHP records.

### Brand personality
Professional, modern, trustworthy, financially credible, developer-friendly, clean, efficient, international, and approachable.

### The idea
Everything is taken from the mark. A K whose arm becomes a ribbon climbs from cobalt through cyan to a mint arrow and lands on a gold peso coin. **Blue to cyan means money in motion; gold means pesos that have landed.** Apply that one idea everywhere colour carries meaning.

## Logo
The mark is the gradient K in `public/brand/` (`web-logo.png`, `social-avatar.png`, `og-image.png`, `email-header.png`). It is full-colour raster artwork. The flat SVGs in `logo/` and `favicon/` are the retired geometric mark and must not be used.

The wordmark is live text beside the mark: Plus Jakarta Sans 800, "Kita" in text-primary and "Flux" in primary, with tracking around -0.025em.

### Minimum size
- Mark: 24 px in UI; 28 px preferred
- Full lockup: 140 px wide on screen

### Clear space
Keep clear space around the mark equal to half the peso coin's diameter.

### Do not
- Stretch, distort, recolour, outline or flatten the mark
- Add shadows or effects to the mark
- Place it directly on cobalt, photos or low-contrast grounds (use a white tile with 24 px corners)
- Bake the wordmark into an image

## Color system
Logo hues are identical in light and dark themes and are used as **fills only**: never as text, never on a button.

| Token | HEX | Usage |
|---|---|---|
| brand-cobalt | #0444C6 | The K's shaded stem. Brand panels (auth), with white text |
| brand-royal | #0666E9 | The K's lit stem. Marketing fills |
| brand-azure | #0385FD | Ribbon; gradient stop |
| brand-cyan | #04C0FD | Ribbon and arm; foreign-currency marker (`flow`) |
| brand-mint | #19DF93 | Arrow tip; gradient end, positive chart marks |
| coin-orange | #FE8A00 | Coin edge; gradient stop |
| coin-gold | #FDCE00 | Coin face; PHP marker (`php`) |
| on-brand | #0A1733 | Text on cyan, mint, gold or orange |

UI layer (light / dark):

| Token | Light | Dark | Usage |
|---|---|---|---|
| primary | #0558E0 | #4D95FF | The one main action, links, active nav |
| canvas | #F5F8FD | #060D1E | Page background |
| surface | #FFFFFF | #0B1630 | Cards, forms, panels |
| ink | #0A1733 | #EDF2FC | Primary text |
| ink-muted | #43506B | #B4C0DA | Secondary text, labels |
| ink-subtle | #5C6984 | #8A98B8 | Metadata, hints |
| line | #DAE2F0 | #1E2E52 | Hairlines (decorative) |
| line-control | #8595B3 | #5A6D96 | Input borders (3:1) |
| flow-ink | #006F9E | #4FD4FF | Foreign-currency figures, when tinted |
| php-ink | #8A5300 | #FFD23F | Landed PHP figures, when tinted |
| success | #12A06A | #3DDC97 | Paid |
| warning | #E2690B | #FF9A3D | Needs review; orange, never gold |
| danger | #D42A37 | #F2555F | Overdue, destructive |

Every text colour meets 4.5:1 on canvas, surface and surface-muted in both themes. Every status also shows its word.

### Gradients
`gradient-flux` (cobalt → azure → cyan → mint) and `gradient-coin` (orange → gold) are for brand moments only: the 3 px top edge of the landing hero, auth panel and emails, and brand art. Never behind text, never on a button, card or chart area.

## Typography
- **Display and headings:** Plus Jakarta Sans 600–800 (wordmark, hero, h1–h3)
- **Interface and body:** IBM Plex Sans 400–700
- **Financial values:** IBM Plex Mono 400–600, tabular figures, for every amount, rate and invoice number
- **Invoices/PDFs:** Helvetica (built into the PDF renderer), in the same neutral colours

## UI direction
- One primary action per view, in `primary`. Logo hues and gradients never mark an action.
- Tint headline money only: foreign currency in flow-ink, PHP in php-ink. Table columns stay ink.
- Show a payment as three numbers in order: invoiced, net after fee, landed in pesos.
- Radii are soft like the mark: 10 px controls, 16 px cards, 24 px brand tiles, pills for badges.
- Depth is quiet: a hairline border and a faint shadow; lifted surfaces get a cobalt-tinted shadow.
- Focus is a solid 2 px ring in `focus-ring`.
- Empty states: calm, practical, one action.
- PDFs: readability and print safety over decoration.

The full system, with live components, lives in the KitaFlux design system (see `brand.json` → `designSystem`).
