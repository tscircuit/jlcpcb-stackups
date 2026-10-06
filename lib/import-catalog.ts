import { createHash } from "node:crypto"
import { z } from "zod"
import {
  catalogSchema,
  CIRCUIT_JSON_REVISION,
  entrySchema,
  SOURCE_API_URL,
  SOURCE_URL,
  type StackupCatalog,
} from "./schema"

const positive = z.number().finite().positive()
const text = z.string().min(1)
const thickness = text
  .regex(
    /^\d+(?:\.\d+)?mm$/,
    "Thickness must include explicit mm units, for example 0.2mm",
  )
  .transform((millimeters) => Number(millimeters.slice(0, -2)))
  .pipe(positive)
const rawEntrySchema = z
  .object({
    templateName: text,
    showName: text,
    impedanceTemplateCode: text,
    stencilLayer: z
      .number()
      .int()
      .min(4)
      .max(32)
      .refine((count) => count % 2 === 0),
    stencilPly: positive,
    cuprumThickness: positive,
    insideCuprumThickness: positive,
    compressionThickness: positive,
    enableFlag: z.boolean(),
    defaultFlag: z.boolean(),
    expeditedFlag: z.boolean(),
    delamination: z.boolean(),
    innerLayerCoverlay: z.boolean(),
    plateType: z.number().int(),
    laminationType: z.number().int(),
    sort: z.number().int(),
    fixedFee: z.number().finite(),
    coefficient: z.number().finite(),
    pricePanelFixedFeeVO: z
      .object({
        fixedFeeFlag: z.boolean().nullable(),
        fixedFeeFlagBatch: z.boolean().nullable(),
      })
      .strict(),
    iaminationList: z
      .array(
        z
          .object({
            iaminationType: z.number().int(),
            content: z.union([z.string(), z.record(z.unknown())]),
            contentKey: text,
            sort: z.number().int().positive(),
          })
          .strict(),
      )
      .min(1),
  })
  .strict()

const outerCopperSchema = z
  .object({
    LineThickness: thickness,
    LineLayer: z.enum(["Top Layer", "Bottom Layer"]),
    lineMaterialType: z.literal("Copper"),
  })
  .strict()
const prepregSchema = z
  .object({
    preThickness: thickness,
    preMaterialType: text,
    preLayer: z.literal("Prepreg"),
  })
  .strict()
const coreSchema = z
  .object({
    coreBoardThickness1: thickness,
    coreBoardThickness2: thickness,
    coreBoardThickness3: thickness,
    coreBoardLayer1: text.regex(/^Inner Layer L\d+$/),
    coreBoardLayer2: z.literal("Core"),
    coreBoardLayer3: text.regex(/^Inner Layer L\d+$/),
    coreBoardMaterialType1: z.literal("Copper"),
    coreBoardMaterialType2: z.literal("Core"),
    coreBoardMaterialType3: z.literal("Copper"),
    coreBoardRemark: z.string(),
  })
  .strict()
const bareCoreSchema = z
  .object({
    lightPlateThickness: thickness,
    lightPlateLayer: z.literal("Core"),
    lightPlateMaterialType: z.literal("Core"),
    lightPlateRemark: z.string(),
  })
  .strict()

function expandLamination(
  segment: z.infer<typeof rawEntrySchema>["iaminationList"][number],
) {
  const content: unknown =
    typeof segment.content === "string"
      ? JSON.parse(segment.content)
      : segment.content
  switch (segment.iaminationType) {
    case 1: {
      const copper = outerCopperSchema.parse(content)
      return [
        {
          type: "copper",
          layer: copper.LineLayer === "Top Layer" ? "top" : "bottom",
          thickness_mm: copper.LineThickness,
        },
      ]
    }
    case 2: {
      const prepreg = prepregSchema.parse(content)
      return [
        {
          type: "dielectric",
          dielectric_type: "prepreg",
          material: prepreg.preMaterialType,
          thickness_mm: prepreg.preThickness,
        },
      ]
    }
    case 3: {
      const core = coreSchema.parse(content)
      return [
        {
          type: "copper",
          layer: `inner${Number(core.coreBoardLayer1.slice(13)) - 1}`,
          thickness_mm: core.coreBoardThickness1,
        },
        {
          type: "dielectric",
          dielectric_type: "core",
          thickness_mm: core.coreBoardThickness2,
        },
        {
          type: "copper",
          layer: `inner${Number(core.coreBoardLayer3.slice(13)) - 1}`,
          thickness_mm: core.coreBoardThickness3,
        },
      ]
    }
    case 9: {
      const core = bareCoreSchema.parse(content)
      return [
        {
          type: "dielectric",
          dielectric_type: "core",
          thickness_mm: core.lightPlateThickness,
        },
      ]
    }
    default:
      throw new Error(`Unsupported lamination type ${segment.iaminationType}`)
  }
}

function normalizeEntry(rawEntry: z.infer<typeof rawEntrySchema>) {
  if (
    rawEntry.delamination ||
    rawEntry.innerLayerCoverlay ||
    ![1, 2].includes(rawEntry.laminationType)
  ) {
    throw new Error(
      "Unsupported delamination, coverlay, or lamination construction",
    )
  }
  const segments = [...rawEntry.iaminationList].sort((a, b) => a.sort - b.sort)
  if (segments.some((segment, index) => segment.sort !== index + 1)) {
    throw new Error("Lamination sort must be unique and contiguous from 1")
  }
  return entrySchema.parse({
    template_id: rawEntry.templateName,
    template_code: rawEntry.impedanceTemplateCode,
    display_name: rawEntry.showName,
    num_layers: rawEntry.stencilLayer,
    thickness_mm: rawEntry.stencilPly,
    outer_copper_oz: rawEntry.cuprumThickness,
    inner_copper_oz: rawEntry.insideCuprumThickness,
    physical_thickness_mm: rawEntry.compressionThickness,
    stackup: {
      source: "specified",
      manufacturer: "JLCPCB",
      manufacturer_stackup_id: rawEntry.templateName,
      source_url: SOURCE_URL,
      layers: segments.flatMap<unknown>(expandLamination),
    },
  })
}

function getRejectedIdentity(rawEntry: unknown) {
  const identity = z
    .object({
      templateName: z.string().optional(),
      impedanceTemplateCode: z.string().optional(),
    })
    .passthrough()
    .safeParse(rawEntry)
  return {
    template_id: identity.success ? (identity.data.templateName ?? "") : "",
    template_code: identity.success
      ? (identity.data.impedanceTemplateCode ?? "")
      : "",
  }
}

/** Import a captured response offline. Neither this function nor the resolver fetches the API. */
export function importJlcStackupCatalog(capture: {
  response_body: string
  retrieved_at: string
}): StackupCatalog {
  const response = z
    .object({
      success: z.literal(true),
      code: z.literal(200),
      message: z.string().nullable(),
      errorCode: z.string().nullable(),
      data: z.array(z.unknown()),
    })
    .strict()
    .parse(JSON.parse(capture.response_body))
  const response_sha256 = createHash("sha256")
    .update(capture.response_body)
    .digest("hex")
  const catalog: StackupCatalog = {
    format_version: 1,
    revision: `jlcpcb-${capture.retrieved_at.slice(0, 10)}-${response_sha256}`,
    provenance: {
      source_url: SOURCE_URL,
      source_api_url: SOURCE_API_URL,
      retrieved_at: capture.retrieved_at,
      response_sha256,
      response_bytes: Buffer.byteLength(capture.response_body),
      request: { method: "POST", body: "{}" },
      circuit_json_revision: CIRCUIT_JSON_REVISION,
      redistribution_permission: "unconfirmed",
    },
    coverage: {
      source_records: response.data.length,
      excluded_records: 0,
      named_template_ids: 0,
      accepted_entries: 0,
      rejected_entries: 0,
    },
    entries: [],
    rejected: [],
  }
  const namedTemplateIds = new Set<string>()
  for (const rawEntry of response.data) {
    try {
      const parsed = rawEntrySchema.parse(rawEntry)
      if (
        !parsed.enableFlag ||
        parsed.plateType !== 1 ||
        parsed.showName === "No requirement"
      ) {
        catalog.coverage.excluded_records++
        continue
      }
      namedTemplateIds.add(parsed.templateName)
      catalog.entries.push(normalizeEntry(parsed))
    } catch (error) {
      const identity = getRejectedIdentity(rawEntry)
      if (identity.template_id) namedTemplateIds.add(identity.template_id)
      catalog.rejected.push({
        ...identity,
        reason:
          error instanceof z.ZodError
            ? error.issues
                .map(
                  (issue) =>
                    `${issue.path.join(".") || "entry"}: ${issue.message}`,
                )
                .join("; ")
            : error instanceof Error
              ? error.message
              : String(error),
      })
    }
  }
  catalog.coverage.named_template_ids = namedTemplateIds.size
  catalog.coverage.accepted_entries = catalog.entries.length
  catalog.coverage.rejected_entries = catalog.rejected.length
  return catalogSchema.parse(catalog)
}
