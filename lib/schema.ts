import { z } from "zod"

export const SOURCE_URL = "https://jlcpcb.com/impedance"
export const SOURCE_API_URL =
  "https://jlcpcb.com/api/overseas-core-platform/shoppingCart/getImpedanceTemplateSettings"
export const CIRCUIT_JSON_REVISION = "8876d6489873b5287903f81d8794c9cff18729de"

const positive = z.number().finite().positive()
const text = z.string().trim().min(1)
const physicalCopperLayerRef = z.enum([
  "top",
  "bottom",
  "inner1",
  "inner2",
  "inner3",
  "inner4",
  "inner5",
  "inner6",
  "inner7",
  "inner8",
  "inner9",
  "inner10",
  "inner11",
  "inner12",
  "inner13",
  "inner14",
  "inner15",
  "inner16",
  "inner17",
  "inner18",
  "inner19",
  "inner20",
  "inner21",
  "inner22",
  "inner23",
  "inner24",
  "inner25",
  "inner26",
  "inner27",
  "inner28",
  "inner29",
  "inner30",
])
const copper = z
  .object({
    type: z.literal("copper"),
    layer: physicalCopperLayerRef,
    thickness_mm: positive,
  })
  .strict()
const dielectric = z
  .object({
    type: z.literal("dielectric"),
    dielectric_type: z.enum(["core", "prepreg"]),
    material: text.optional(),
    thickness_mm: positive,
  })
  .strict()

// Structural subset of Circuit JSON PR #871. No dependency on the unmerged PR.
const physicalStackupSchema = z
  .object({
    source: z.literal("specified"),
    manufacturer: z.literal("JLCPCB"),
    manufacturer_stackup_id: text,
    source_url: z.literal(SOURCE_URL),
    layers: z.array(z.discriminatedUnion("type", [copper, dielectric])).min(3),
  })

  .strict()
  .superRefine((stackup, ctx) => {
    const copperLayers = stackup.layers.filter(
      (layer) => layer.type === "copper",
    )
    let copperPosition = 0
    for (const [index, layer] of stackup.layers.entries()) {
      if (layer.type === "dielectric") {
        if (index === 0 || index === stackup.layers.length - 1) {
          ctx.addIssue({
            code: "custom",
            path: ["layers", index],
            message: "Dielectric must be between copper layers",
          })
        }
        continue
      }
      const expected =
        copperPosition === 0
          ? "top"
          : copperPosition === copperLayers.length - 1
            ? "bottom"
            : `inner${copperPosition}`
      if (
        layer.layer !== expected ||
        stackup.layers[index - 1]?.type === "copper"
      ) {
        ctx.addIssue({
          code: "custom",
          path: ["layers", index],
          message: `Expected separated copper layer ${expected}`,
        })
      }
      copperPosition++
    }
  })

// The pinned Circuit JSON LayerRef stops at inner8 (10 copper layers).
const circuitJsonCopperLayerRef = z.enum([
  "top",
  "bottom",
  "inner1",
  "inner2",
  "inner3",
  "inner4",
  "inner5",
  "inner6",
  "inner7",
  "inner8",
])
export const stackupSchema = physicalStackupSchema.transform((stackup) => ({
  ...stackup,
  layers: stackup.layers.map((layer) =>
    layer.type === "copper"
      ? { ...layer, layer: circuitJsonCopperLayerRef.parse(layer.layer) }
      : layer,
  ),
}))

export const selectorsSchema = z
  .object({
    template_id: text,
    template_code: text.optional(),
    num_layers: z.number().int().min(4).max(32).optional(),
    thickness_mm: positive.optional(),
    outer_copper_oz: positive.optional(),
    inner_copper_oz: positive.optional(),
  })
  .strict()
export const filterSchema = selectorsSchema
  .omit({ template_id: true, template_code: true })
  .strict()

export const entrySchema = z
  .object({
    template_id: text,
    template_code: text,
    display_name: text,
    num_layers: z.number().int().min(4).max(32),
    thickness_mm: positive,
    outer_copper_oz: positive,
    inner_copper_oz: positive,
    physical_thickness_mm: positive,
    stackup: physicalStackupSchema,
  })
  .strict()
  .superRefine((entry, ctx) => {
    const copperCount = entry.stackup.layers.filter(
      (layer) => layer.type === "copper",
    ).length
    const physicalThickness = entry.stackup.layers.reduce(
      (sum, layer) => sum + layer.thickness_mm,
      0,
    )
    if (
      copperCount !== entry.num_layers ||
      Math.abs(physicalThickness - entry.physical_thickness_mm) > 1e-6 ||
      entry.template_id !== entry.stackup.manufacturer_stackup_id
    ) {
      ctx.addIssue({
        code: "custom",
        message:
          "Template ID, copper count, or expanded physical thickness disagrees with entry",
      })
    }
  })

export const catalogSchema = z
  .object({
    format_version: z.literal(1),
    revision: text,
    provenance: z
      .object({
        source_url: z.literal(SOURCE_URL),
        source_api_url: z.literal(SOURCE_API_URL),
        retrieved_at: z.string().datetime({ offset: true }),
        response_sha256: z.string().regex(/^[a-f0-9]{64}$/),
        response_bytes: z.number().int().positive(),
        request: z
          .object({ method: z.literal("POST"), body: z.literal("{}") })
          .strict(),
        circuit_json_revision: z.literal(CIRCUIT_JSON_REVISION),
        redistribution_permission: z.literal("unconfirmed"),
      })
      .strict(),
    coverage: z
      .object({
        source_records: z.number().int().nonnegative(),
        excluded_records: z.number().int().nonnegative(),
        named_template_ids: z.number().int().nonnegative(),
        accepted_entries: z.number().int().nonnegative(),
        rejected_entries: z.number().int().nonnegative(),
      })
      .strict(),
    rejected: z.array(
      z
        .object({
          template_id: z.string(),
          template_code: z.string(),
          reason: text,
        })
        .strict(),
    ),
    entries: z.array(entrySchema),
  })
  .strict()
  .superRefine((catalog, ctx) => {
    const coverage = catalog.coverage
    const entryKeys = catalog.entries.map((entry) =>
      JSON.stringify([
        entry.template_id,
        entry.template_code,
        entry.num_layers,
        entry.thickness_mm,
        entry.outer_copper_oz,
        entry.inner_copper_oz,
      ]),
    )
    if (
      coverage.accepted_entries !== catalog.entries.length ||
      coverage.rejected_entries !== catalog.rejected.length ||
      coverage.source_records !==
        coverage.accepted_entries +
          coverage.rejected_entries +
          coverage.excluded_records ||
      new Set(entryKeys).size !== entryKeys.length
    ) {
      ctx.addIssue({
        code: "custom",
        message: "Coverage counts or unique entry keys disagree with catalog",
      })
    }
  })

export type PcbStackup = z.infer<typeof stackupSchema>
export type StackupCatalog = z.infer<typeof catalogSchema>
export type StackupEntry = z.infer<typeof entrySchema>
export type StackupSelectors = z.infer<typeof selectorsSchema>
export type StackupFilter = z.infer<typeof filterSchema>
