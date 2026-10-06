import { CIRCUIT_JSON_REVISION, SOURCE_API_URL, SOURCE_URL } from "./schema"

// Capture metadata only. No manufacturer response or physical entries are bundled.
export const sourceCapture = {
  source_url: SOURCE_URL,
  source_api_url: SOURCE_API_URL,
  retrieved_at: "2026-10-06T02:42:50.206354+00:00",
  response_sha256:
    "fd73e364680f4ea17efa859104bc44bd41004a1b8e0a574942dc396d0b8d1d57",
  response_bytes: 2900388,
  request: { method: "POST", body: "{}" },
  circuit_json_revision: CIRCUIT_JSON_REVISION,
  source_records: 706,
  excluded_no_requirement_records: 96,
  named_template_ids: 610,
  normalized_entries: 609,
  rejected_missing_units: 1,
  circuit_json_compatible_entries: 446,
  unsupported_circuit_json_layers_entries: 163,
  redistributed_manufacturer_entries: 0,
  redistribution_permission: "unconfirmed",
  terms_url: "https://jlcpcb.com/help/article/terms-&-conditions",
  terms_section: "VI. Copyright and Ownership",
  terms_last_updated: "2026-03-02",
} as const
