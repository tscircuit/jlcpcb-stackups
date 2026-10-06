# jlcpcb-stackups

Versioned JLCPCB physical stackup importer and offline resolver returning the `pcb_board.stackup` fields proposed in [Circuit JSON #871](https://github.com/tscircuit/circuit-json/pull/871), pinned to `8876d6489873b5287903f81d8794c9cff18729de`. The schema is a structural subset; this package does not depend on the unmerged PR.

**No manufacturer catalog is distributed.** [JLCPCB's terms, section VI](https://jlcpcb.com/help/article/terms-&-conditions) restrict redistribution; permission remains unconfirmed. Original code and synthetic tests can be reviewed now. Keep captured responses and normalized catalogs in ignored `local-catalog/` until permission is established. No npm release is configured.

```ts
import { createStackupResolver } from "@tscircuit/jlcpcb-stackups"
import { importJlcStackupCatalog } from "@tscircuit/jlcpcb-stackups/lib/import-catalog"

// Use an authorized, locally captured response from the official API.
const catalog = importJlcStackupCatalog({ response_body, retrieved_at })
const resolver = createStackupResolver(catalog, { revision: pinnedRevision })
const choices = resolver.list({ num_layers: 4, thickness_mm: 1.6,
  outer_copper_oz: 1, inner_copper_oz: 0.5 })
const selected = resolver.resolve({ template_id: selectedTemplateId,
  template_code: selectedTemplateCode })
if (!("error" in selected)) {
  board.num_layers = selected.num_layers
  board.stackup = selected.stackup
}
```

`template_id` is the exact engineering `templateName`; `display_name` is the separate `showName`. The backend `impedanceTemplateCode` remains `template_code`. Variant selectors resolve ambiguity; names, presets, and unknown IDs never select a fallback. `jlcpcb_economy` is a via-hole rule preset, not a physical template. The resolver and index perform no network requests; the browser entrypoint avoids Node imports. Capture import uses Node/Bun crypto.

The physical catalog/index supports 4–32 copper layers. The pinned Circuit JSON revision allows only `inner1`–`inner8`; selections above 10 copper layers return `unsupported_circuit_json_layers`. Index entries expose `circuit_json_compatible`. The 2026-10-06 local capture has 610 named IDs: 609 normalize, one is rejected for missing thickness units, and 446 can resolve to this Circuit JSON revision. [Capture metadata](lib/source-capture.ts) preserves its date/hash and exact counts. None of these manufacturer entries are bundled here.

Import expands lamination types 1, 2, 3, and 9 in source order, requires explicit `mm`, validates copper count/order and geometry against `compressionThickness`, and rejects unknown fields/constructions. Nominal `stencilPly` stays separate from expanded physical thickness. It excludes disabled, nonstandard plate types and “No requirement” duplicates. Missing conductivity, Er/frequency, and loss remain absent; source declarations do not imply manufacturing verification. SHA-256 covers the exact UTF-8 response bytes, with capture date, request, endpoint, schema revision, counts and rejection reasons retained outside the stackup object.

`bun install`, `bun test`, `bun run typecheck`, `bun run formatcheck`.
