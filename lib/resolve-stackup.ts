import {
  catalogSchema,
  filterSchema,
  selectorsSchema,
  stackupSchema,
  type StackupCatalog,
  type StackupEntry,
  type StackupFilter,
  type StackupSelectors,
} from "./schema"

function matchesFilter(entry: StackupEntry, filter: StackupFilter): boolean {
  return Object.entries(filter).every(
    ([key, selector]) => entry[key as keyof StackupFilter] === selector,
  )
}

export function createStackupResolver(
  input: unknown,
  pin: { revision: string },
) {
  const catalog: StackupCatalog = catalogSchema.parse(input)
  if (catalog.revision !== pin.revision)
    throw new Error(
      `Expected catalog revision ${pin.revision}, received ${catalog.revision}`,
    )
  return {
    revision: catalog.revision,
    provenance: { ...catalog.provenance },
    list(filter: StackupFilter = {}) {
      const parsed = filterSchema.parse(filter)
      return catalog.entries
        .filter((entry) => matchesFilter(entry, parsed))
        .map(({ stackup, ...indexEntry }) => ({
          ...indexEntry,
          circuit_json_compatible: indexEntry.num_layers <= 10,
        }))
    },
    resolve(selectors: StackupSelectors) {
      const parsed = selectorsSchema.safeParse(selectors)
      if (!parsed.success)
        return {
          error: {
            error_code: "invalid_selector",
            message: parsed.error.message,
          },
        } as const
      const { template_id, template_code, ...filter } = parsed.data
      const namedEntries = catalog.entries.filter(
        (entry) => entry.template_id === template_id,
      )
      const candidates = namedEntries.filter(
        (entry) =>
          (!template_code || entry.template_code === template_code) &&
          matchesFilter(entry, filter),
      )
      if (candidates.length === 0) {
        const rejected = catalog.rejected.filter(
          (entry) =>
            entry.template_id === template_id &&
            (!template_code || entry.template_code === template_code),
        )
        const error_code = rejected.length
          ? "invalid_source_entry"
          : namedEntries.length
            ? "variant_not_found"
            : "unknown_template_id"
        return {
          error: {
            error_code,
            message: rejected.length
              ? rejected.map((entry) => entry.reason).join("; ")
              : `No template matches ${template_id} and the supplied selectors in ${catalog.revision}`,
          },
        } as const
      }
      if (candidates.length !== 1) {
        return {
          error: {
            error_code: "ambiguous_template_id",
            message: `Supply variant selectors or template_code for ${template_id}`,
            candidates: candidates.map(
              ({ stackup, ...indexEntry }) => indexEntry,
            ),
          },
        } as const
      }
      const selected = structuredClone(candidates[0]!)
      if (selected.num_layers > 10) {
        return {
          error: {
            error_code: "unsupported_circuit_json_layers",
            message: `Template ${selected.template_id} has ${selected.num_layers} copper layers; pinned Circuit JSON LayerRef supports at most 10`,
          },
        } as const
      }
      return {
        revision: catalog.revision,
        template_code: selected.template_code,
        num_layers: selected.num_layers,
        nominal_board_thickness_mm: selected.thickness_mm,
        physical_thickness_mm: selected.physical_thickness_mm,
        stackup: stackupSchema.parse(selected.stackup),
      }
    },
  }
}
