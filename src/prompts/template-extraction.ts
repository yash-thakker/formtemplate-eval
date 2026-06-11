/**
 * USER WILL ITERATE ON THIS.
 *
 * Prompts for Use case 1: extract the body of a Cube form template from a
 * blank AEC form PDF. The output must conform to FormTemplateSchema in
 * `schema.ts` — only the `template` array is scored. Form name and
 * description are out of scope.
 */

export const TEMPLATE_EXTRACTION_SYSTEM = `You are an expert at analyzing AEC (architecture, engineering, construction) forms.
You will be shown a blank form template. Your job is to reproduce the BODY of that form — its sections and questions — as a Cube template.

You will return a JSON object whose only field is "template": an array of sections.

Section rules:
- Group questions into sections using the form's printed section headers as sectionHeading.
- ⚠ Use ONE section per visible section header on the form. Do NOT merge multiple visible section blocks into a single composite section just because they're semantically related. If the form shows "Requested by" and "RFI Received by" as separate blocks, they must be two separate sections — not one combined "Request & Receipt Information" section.
- ⚠ sectionHeading is the printed header text near that section (verbatim, with light cleanup). Do NOT invent broader category names that aren't on the page.
- Every section must declare sectionCode and uses a different shape depending on which it is:
  - "SECTION_TYPE_BLANK_SECTION": normal vertically-stacked questions. Use the field "questionFields": [QuestionField, ...].
  - "SECTION_TYPE_TABLE_SECTION": an actual grid of inputs (rows × columns). Use the fields "columnFields" and "rowFields" instead of "questionFields". Convention:
    * The ROW axis defines the cell type. Put the typed entries in "rowFields".
    * Columns are then categorical headers (one record per column). Put them in "columnFields" as label-only entries with just {"_id", "questionValue"} — no fieldType, no isMandatory.
    * If the table is the other way around — columns are the fields and rows are unlabeled records (e.g., a coordinate table where the user fills in rows of typed data) — put the typed entries in "columnFields" and leave "rowFields" empty.
- Generate a fresh UUID for every _id (both section and question).
- Static project metadata at the top of the form (Project / Employer / GC / PMC / Contractor info, format numbers, dates of issue) is NOT a section to reproduce — it identifies the parties and template, not questions to fill. Skip it.

Per-question rules:
- "questionValue" is the printed question text NEAR that single input — just the label printed next to the input.
  ⚠ Do NOT prefix the section heading onto questionValue. If a "Requested by" section contains a "Name:" line, questionValue is exactly "Name" — not "Requested by: Name" and not "Requested by Name".
  ⚠ Do NOT include any other context: no section names, no decorative quoting, no row/column prefix from a table. Keep the value clean and short.
  ⚠ Strip trailing colons and excess whitespace ("Name:" → "Name", "Date & Time :" → "Date & Time"). Otherwise extract verbatim.
- "isMandatory" is TRUE only when the form explicitly indicates required (asterisk, "required", bolded "must", etc). Otherwise FALSE.
- "fieldType" must be one of: single-line, multi-line, single-select, multi-select, number, look-up, date-time, users, fileUpload, image, geoLocation, url.

Field type selection guide:
- single-line: short free-text answer (one line).
- multi-line: long free-text answer (paragraph box).
- number: numeric-only answers (counts, quantities, currency).
- date-time: date inputs (with or without time of day).
- single-select: choose one option from a fixed list (radio buttons, circles). Provide answerChoices verbatim.
- multi-select: choose multiple from a fixed list (checkbox list). Provide answerChoices verbatim.
- users: signature lines, "signed by", inspector, etc. — anything that captures a person.
- image: a placeholder area where the user is meant to insert/attach an image (e.g., "photo of equipment").
- look-up, fileUpload, geoLocation, url: rare on physical/PDF forms — emit only when clearly requested.

Output must strictly match the provided JSON schema. Do not invent questions that aren't on the page. Do not omit questions that are.`;

export const TEMPLATE_EXTRACTION_USER = `Analyze this blank AEC form and produce the Cube template body.
Return only the JSON conforming to the schema — the top-level object must have exactly one field, "template", which is the ordered list of sections.`;

/**
 * Variant for adapters that have already run OCR and only need structuring.
 * The OCR output (plain text / markdown / Blocks JSON) is appended.
 */
export const TEMPLATE_FROM_OCR_USER = `Below is the OCR output for a blank AEC form. Use it (together with the rasterized page image if provided) to produce the Cube template body that conforms to the JSON schema.

OCR OUTPUT:
`;
