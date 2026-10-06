import { expect, test } from "bun:test"
import { createHash } from "node:crypto"
import { createStackupResolver } from "lib/index"
import { importJlcStackupCatalog } from "lib/import-catalog"
import {
  syntheticEntry,
  syntheticResponse,
} from "./fixtures/synthetic-response"

const retrieved_at = "2026-10-06T00:00:00Z"
function importEntries(entries?: unknown[]) {
  return importJlcStackupCatalog({
    response_body: syntheticResponse(entries),
    retrieved_at,
  })
}
function resolverFor(entries?: unknown[]) {
  const catalog = importEntries(entries)
  return createStackupResolver(catalog, { revision: catalog.revision })
}

test("expands copper and dielectric geometry to Circuit JSON without invented quantities", () => {
  const resolver = resolverFor()
  const resolved = resolver.resolve({ template_id: "SYNTHETIC-4L" })
  expect(resolved).toMatchSnapshot()
  if ("error" in resolved) throw new Error("Expected stackup")
  expect(resolved.stackup.layers.map((layer) => layer.thickness_mm)).toEqual([
    0.04, 0.2, 0.02, 0.63, 0.02, 0.2, 0.04,
  ])
  expect(JSON.stringify(resolved)).not.toMatch(
    /conductivity|dielectric_constant|dielectric_loss/,
  )
  resolved.stackup.layers[0]!.thickness_mm = 99
  expect(resolver.resolve({ template_id: "SYNTHETIC-4L" })).not.toEqual(
    resolved,
  )
})

test("records exact capture provenance, engineering ID, backend code, and display name separately", () => {
  const response_body = syntheticResponse()
  const catalog = importJlcStackupCatalog({ response_body, retrieved_at })
  expect(catalog.provenance.response_sha256).toBe(
    createHash("sha256").update(response_body).digest("hex"),
  )
  expect(catalog.provenance.response_bytes).toBe(
    Buffer.byteLength(response_body),
  )
  expect(catalog.entries[0]).toMatchObject({
    template_id: "SYNTHETIC-4L",
    template_code: "synthetic-code-1",
    display_name: "Synthetic display label",
  })
  expect(() =>
    createStackupResolver(catalog, { revision: "another-revision" }),
  ).toThrow("Expected catalog revision")
})

test("filters offline and requires exact variant selection when an ID is ambiguous", () => {
  const variant = {
    ...syntheticEntry,
    impedanceTemplateCode: "synthetic-code-2",
    stencilPly: 1.4,
    cuprumThickness: 2,
  }
  const resolver = resolverFor([syntheticEntry, variant])
  expect(
    resolver.list({
      num_layers: 4,
      thickness_mm: 1.4,
      outer_copper_oz: 2,
      inner_copper_oz: 0.5,
    }),
  ).toHaveLength(1)
  expect(resolver.list()[0]).not.toHaveProperty("stackup")
  expect(resolver.resolve({ template_id: "SYNTHETIC-4L" })).toMatchObject({
    error: { error_code: "ambiguous_template_id" },
  })
  expect(
    resolver.resolve({
      template_id: "SYNTHETIC-4L",
      template_code: "synthetic-code-2",
    }),
  ).toMatchObject({
    template_code: "synthetic-code-2",
    nominal_board_thickness_mm: 1.4,
  })
  expect(
    resolver.resolve({ template_id: "SYNTHETIC-4L", outer_copper_oz: 2 }),
  ).toMatchObject({ template_code: "synthetic-code-2" })
  expect(
    resolver.resolve({ template_id: "SYNTHETIC-4L", thickness_mm: 2 }),
  ).toMatchObject({ error: { error_code: "variant_not_found" } })
  expect(
    resolver.resolve({ template_id: "synthetic display label" }),
  ).toMatchObject({ error: { error_code: "unknown_template_id" } })
  expect(resolver.resolve({ template_id: "jlcpcb_economy" })).toMatchObject({
    error: { error_code: "unknown_template_id" },
  })
})

test("excludes no-requirement duplicates, disabled records, and other plate types", () => {
  const catalog = importEntries([
    syntheticEntry,
    { ...syntheticEntry, showName: "No requirement" },
    { ...syntheticEntry, enableFlag: false },
    { ...syntheticEntry, plateType: 2 },
  ])
  expect(catalog.coverage).toEqual({
    source_records: 4,
    excluded_records: 3,
    named_template_ids: 1,
    accepted_entries: 1,
    rejected_entries: 0,
  })
})

test("keeps 12-layer physical geometry in the index but rejects incompatible Circuit JSON output", () => {
  const segments: Array<{
    iaminationType: number
    contentKey: string
    sort: number
    content: unknown
  }> = [syntheticEntry.iaminationList[0]!, syntheticEntry.iaminationList[1]!]
  for (let pair = 0; pair < 5; pair++) {
    segments.push({
      ...syntheticEntry.iaminationList[2]!,
      content: {
        ...syntheticEntry.iaminationList[2]!.content,
        coreBoardThickness2: "0.1mm",
        coreBoardLayer1: `Inner Layer L${pair * 2 + 2}`,
        coreBoardLayer3: `Inner Layer L${pair * 2 + 3}`,
      },
    })
    if (pair < 4)
      segments.push({
        ...syntheticEntry.iaminationList[1]!,
        content: {
          preThickness: "0.1mm",
          preMaterialType: "synthetic",
          preLayer: "Prepreg",
        },
      })
  }
  segments.push(
    syntheticEntry.iaminationList[3]!,
    syntheticEntry.iaminationList[4]!,
  )
  const entry = {
    ...syntheticEntry,
    stencilLayer: 12,
    compressionThickness: 1.58,
    iaminationList: segments.map((segment, index) => ({
      ...segment,
      sort: index + 1,
    })),
  }
  const resolver = resolverFor([entry])
  expect(resolver.list({ num_layers: 12 })).toMatchObject([
    { circuit_json_compatible: false },
  ])
  expect(resolver.resolve({ template_id: "SYNTHETIC-4L" })).toMatchObject({
    error: { error_code: "unsupported_circuit_json_layers" },
  })
})

test.each([
  { ...syntheticEntry, unexpectedField: true },
  { ...syntheticEntry, compressionThickness: 4 },
  { ...syntheticEntry, stencilLayer: 6 },
  { ...syntheticEntry, delamination: true },
  {
    ...syntheticEntry,
    iaminationList: syntheticEntry.iaminationList.map((segment, index) =>
      index === 1
        ? {
            ...segment,
            content: {
              preThickness: "0.20",
              preMaterialType: "synthetic-glass*2",
              preLayer: "Prepreg",
            },
          }
        : segment,
    ),
  },
  {
    ...syntheticEntry,
    iaminationList: syntheticEntry.iaminationList.map((segment, index) =>
      index === 1
        ? {
            ...segment,
            content: {
              preThickness: "0.20mil",
              preMaterialType: "synthetic-glass*2",
              preLayer: "Prepreg",
            },
          }
        : segment,
    ),
  },
  {
    ...syntheticEntry,
    iaminationList: syntheticEntry.iaminationList.map((segment, index) =>
      index === 1
        ? {
            ...segment,
            content: {
              preThickness: "0mm",
              preMaterialType: "synthetic-glass*2",
              preLayer: "Prepreg",
            },
          }
        : segment,
    ),
  },
  {
    ...syntheticEntry,
    iaminationList: syntheticEntry.iaminationList.map((segment, index) =>
      index === 1 ? { ...segment, iaminationType: 99 } : segment,
    ),
  },
  {
    ...syntheticEntry,
    iaminationList: syntheticEntry.iaminationList.map((segment, index) =>
      index === 1 ? { ...segment, sort: 1 } : segment,
    ),
  },
  {
    ...syntheticEntry,
    iaminationList: syntheticEntry.iaminationList.map((segment, index) =>
      index === 1
        ? {
            ...segment,
            content: {
              preThickness: "0.20mm",
              preMaterialType: "synthetic-glass*2",
              preLayer: "Prepreg",
              extra: 1,
            },
          }
        : segment,
    ),
  },
  {
    ...syntheticEntry,
    iaminationList: syntheticEntry.iaminationList.map((segment, index) =>
      index === 0 ? { ...segment, content: "{broken" } : segment,
    ),
  },
  {
    ...syntheticEntry,
    iaminationList: syntheticEntry.iaminationList.map((segment, index) =>
      index === 0
        ? {
            ...segment,
            content: {
              LineThickness: "0.04mm",
              LineLayer: "Bottom Layer",
              lineMaterialType: "Copper",
            },
          }
        : segment,
    ),
  },
])(
  "rejects malformed source entry %# with a clear resolver reason",
  (entry) => {
    const catalog = importEntries([entry])
    expect(catalog.coverage.rejected_entries).toBe(1)
    expect(catalog.rejected[0]!.reason.length).toBeGreaterThan(0)
    const resolver = createStackupResolver(catalog, {
      revision: catalog.revision,
    })
    expect(resolver.resolve({ template_id: "SYNTHETIC-4L" })).toMatchObject({
      error: { error_code: "invalid_source_entry" },
    })
  },
)

test("validates selectors, catalog fields, duplicate entries, and API error envelopes", () => {
  const resolver = resolverFor()
  expect(
    resolver.resolve({ template_id: "SYNTHETIC-4L", thickness_mm: NaN }),
  ).toMatchObject({ error: { error_code: "invalid_selector" } })
  expect(
    resolver.resolve(
      Object.assign({ template_id: "SYNTHETIC-4L" }, { random: 1 }),
    ),
  ).toMatchObject({ error: { error_code: "invalid_selector" } })
  expect(() => resolver.list({ thickness_mm: -1 })).toThrow()
  expect(() => importEntries([syntheticEntry, syntheticEntry])).toThrow(
    "unique entry keys",
  )
  const catalog = importEntries()
  expect(() =>
    createStackupResolver(
      { ...catalog, extra: true },
      { revision: catalog.revision },
    ),
  ).toThrow()
  expect(() =>
    importJlcStackupCatalog({
      response_body:
        '{"success":false,"code":500,"message":"Failure","errorCode":null,"data":[]}',
      retrieved_at,
    }),
  ).toThrow()
})

test("accepts JSON-string contents, unsorted segments, and bare core lamination type 9", () => {
  const bareCore = {
    iaminationType: 9,
    contentKey: "synthetic-bare",
    sort: 2,
    content: {
      lightPlateThickness: "0.1mm",
      lightPlateLayer: "Core",
      lightPlateMaterialType: "Core",
      lightPlateRemark: "Synthetic",
    },
  }
  const entry = {
    ...syntheticEntry,
    compressionThickness: 1.25,
    iaminationList: [
      syntheticEntry.iaminationList[0]!,
      bareCore,
      ...syntheticEntry.iaminationList
        .slice(1)
        .map((segment) => ({ ...segment, sort: segment.sort + 1 })),
    ]
      .reverse()
      .map((segment) => ({
        ...segment,
        content: JSON.stringify(segment.content),
      })),
  }
  expect(importEntries([entry]).entries[0]!.stackup.layers[1]).toEqual({
    type: "dielectric",
    dielectric_type: "core",
    thickness_mm: 0.1,
  })
})
