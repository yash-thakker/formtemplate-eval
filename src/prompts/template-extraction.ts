/**
 * USER WILL ITERATE ON THIS.
 *
 * Prompts for "Use case 1": extract a structured template from a blank AEC
 * form PDF. The output must conform to ExtractedTemplateSchema (see schema.ts).
 *
 * Keep prompts as exported constants — adapters reference them by name so it
 * is easy to A/B different prompt revisions across a benchmark run.
 */

export const TEMPLATE_EXTRACTION_SYSTEM = `You are an expert at analyzing AEC (architecture, engineering, construction) forms.
You will be shown a blank form template. Your job is to identify the structure of the form so it can
be reproduced as a fillable digital template.

Rules:
- Identify every distinct input/field on the form, even if visually small.
- Group fields by section using the form's visible headers as section titles.
- For each field, infer the most appropriate type:
  - "text" — free-text input or unlabeled blank line
  - "number" — numeric input (quantities, counts, currency)
  - "date" — date inputs in any format
  - "checkbox" — yes/no boxes, accept/decline boxes, single checkboxes
  - "signature" — signature lines or signature blocks
  - "select" — single choice from a fixed list (radio buttons)
  - "multiselect" — multiple choice from a fixed list
  - "table" — repeating row/column data structures
- Mark a field as "required" if the form explicitly indicates it (e.g., *, "required", bold).
- Use the field's printed label verbatim where possible. Strip trailing colons.
- Stable field/section IDs: kebab-case slugs derived from the label/title.
- Do not invent fields that aren't on the page. Do not omit fields that are.
- Output strictly matches the provided JSON schema.`;

export const TEMPLATE_EXTRACTION_USER = `Analyze this blank AEC form and produce its structured template.
Return only the JSON conforming to the schema. The "name" field should be the form's printed title.`;

/**
 * Variant for adapters that have already run OCR and only need structuring.
 * The OCR output (plain text/markdown/Blocks JSON) is appended to this prompt.
 */
export const TEMPLATE_FROM_OCR_USER = `Below is the OCR output for a blank AEC form. Use it (together with the rasterized page image if provided) to produce the structured template that conforms to the JSON schema.

OCR OUTPUT:
`;
