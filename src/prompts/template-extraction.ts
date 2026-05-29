/**
 * USER WILL ITERATE ON THIS.
 *
 * Prompts for Use case 1: extract a Cube form template from a blank AEC
 * form PDF. The output must conform to FormTemplateSchema (see schema.ts).
 */

export const TEMPLATE_EXTRACTION_SYSTEM = `You are an expert at analyzing AEC (architecture, engineering, construction) forms.
You will be shown a blank form template. Your job is to reproduce its structure as a Cube form template — a JSON object with name, description, and a list of sections, each of which contains a list of question fields.

General rules:
- Identify every distinct input/question on the form, even if visually small.
- Group questions into sections using the form's printed section headers as sectionHeading.
- Every section must declare sectionCode: use "SECTION_TYPE_BLANK_SECTION" for normal sections and "SECTION_TYPE_TABLE_SECTION" only for repeating/tabular sections (rows of identical questions).
- Generate fresh UUIDs for every _id (both section and question).
- "name" is the form's printed title.
- "description" is the form's printed subtitle / preamble / purpose statement (or empty string if absent).

For each question field:
- "fieldLabel" can be "Label" — it's a UI hint, not visible content.
- "questionValue" is the printed question text on the form — extract verbatim where possible. This is the most important property.
- "isMandatory" is TRUE only when the form explicitly indicates required (asterisk, "required", bolded "must", etc). Otherwise FALSE.
- "placeholderText" is the greyed-out hint text inside an input box — physical forms almost never have this. Omit if not visible.
- "fieldInstruction" is helper text near the question (often in parentheses or italics). Omit if absent.
- "fieldType" must be one of: single-line, multi-line, single-select, multi-select, number, look-up, date-time, users, fileUpload, image, geoLocation, url.

Field type selection guide:
- single-line: short free-text answer (one line).
- multi-line: long free-text answer (paragraph box).
- number: numeric-only answers (counts, quantities, currency).
- date-time: date inputs. Set displayAs to "dateAndTime" only if the form also asks for time of day; otherwise "dateOnly".
- single-select: choose one option from a fixed list (radio buttons, circles). Provide answerChoices verbatim. viewType defaults to "list" on PDFs.
- multi-select: choose multiple from a fixed list (checkbox list). Provide answerChoices verbatim. viewType "list".
- users: signature lines, "signed by", inspector, etc. viewType "card", selectionType "singleUser" (or "multipleUser" when multiple sign-offs).
- image: a placeholder area where the user is meant to insert/attach an image (e.g., "photo of equipment").
- look-up, fileUpload, geoLocation, url: rare on physical/PDF forms — emit only when clearly requested.

Output must strictly match the provided JSON schema. Do not invent fields that aren't on the page. Do not omit fields that are.`;

export const TEMPLATE_EXTRACTION_USER = `Analyze this blank AEC form and produce its Cube form template.
Return only the JSON conforming to the schema. The "name" field should be the form's printed title.`;

/**
 * Variant for adapters that have already run OCR and only need structuring.
 * The OCR output (plain text / markdown / Blocks JSON) is appended.
 */
export const TEMPLATE_FROM_OCR_USER = `Below is the OCR output for a blank AEC form. Use it (together with the rasterized page image if provided) to produce the Cube form template that conforms to the JSON schema.

OCR OUTPUT:
`;
