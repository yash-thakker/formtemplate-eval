/**
 * Cube form-template schema.
 *
 * This is the extraction target: every adapter must produce an object that
 * passes `FormTemplateSchema.safeParse(...)`. Every adapter and scoring
 * function in the project imports from this file; swapping the schema is
 * intended to be a one-file change for the data contract, though scoring
 * heuristics may need adjustment to match the new field shape.
 *
 * The inline comments are deliberately verbose — they double as
 * documentation for prompt authors. Detailed per-field extraction rules
 * live in `src/prompts/template-extraction.ts`; what is captured here is
 * just enough context for someone reading the schema to know what each
 * field means and when it is or is not present on a physical/PDF form.
 */

import { z } from 'zod';

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

/**
 * The complete set of question types Cube supports.
 *
 * Notes for extractors (PDF / physical-form context):
 *   - `single-line`, `multi-line`, `number`, `single-select`, `multi-select`,
 *     `date-time`, `users` (signature line) are common on physical forms.
 *   - `look-up`, `fileUpload`, `image`, `geoLocation`, `url` are
 *     digital-native and rare on PDFs — only emit them when the form
 *     clearly asks for one (e.g., an image placeholder on the page → `image`).
 */
export const FieldTypeEnum = z.enum([
  'single-line',
  'multi-line',
  'single-select',
  'multi-select',
  'number',
  'look-up',
  'date-time',
  'users',
  'fileUpload',
  'image',
  'geoLocation',
  'url',
]);
export type FieldType = z.infer<typeof FieldTypeEnum>;

/**
 * Render style for select-like questions. On PDFs the platform's `dropDown`
 * style is invisible, so always default to `list` unless the form clearly
 * implies a dropdown.
 */
export const SelectViewType = z.enum(['list', 'dropDown']);

/**
 * What a `look-up` field is pointing at. Rare on PDFs.
 */
export const LookUpAnsFieldType = z.enum(['Location', 'Teams']);

/**
 * `date-time` granularity. Default to `dateOnly` unless the form clearly
 * asks for a time of day.
 */
export const DateTimeDisplayAs = z.enum(['dateOnly', 'dateAndTime']);

/**
 * Render style for a `users` (signature / signee) question. PDFs don't
 * distinguish — default to the platform's `card`.
 */
export const UsersViewType = z.enum(['card', 'chip']);

/**
 * Whether a `users` question collects one signee or many.
 */
export const UsersSelectionType = z.enum(['singleUser', 'multipleUser']);

/**
 * Section-type tag. Every section must declare which it is:
 *   - `SECTION_TYPE_BLANK_SECTION`: a normal section of unrelated questions
 *     stacked vertically. The default for most form sections.
 *   - `SECTION_TYPE_TABLE_SECTION`: a tabular / repeating section where the
 *     same set of question fields repeats as rows.
 *
 * Extractors must pick one — there is no "unset" state.
 */
export const SectionCode = z.enum([
  'SECTION_TYPE_BLANK_SECTION',
  'SECTION_TYPE_TABLE_SECTION',
]);

// ---------------------------------------------------------------------------
// Common question-field shape (shared by every fieldType variant)
// ---------------------------------------------------------------------------

/**
 * Fields shared by every question regardless of `fieldType`.
 *
 * Extraction guidance:
 *   - `_id`: generate a fresh UUID for every question. Not parsed from form.
 *   - `fieldLabel`: a UI label string (the platform shows it next to the
 *     input). On PDFs this is usually not visible content; default to
 *     "Label" when unsure.
 *   - `questionValue`: ⭐ the actual question text printed on the form
 *     (e.g., "Date of incident", "Employee full name"). THIS IS THE MOST
 *     IMPORTANT FIELD — extract verbatim where possible.
 *   - `isMandatory`: true ONLY when the form explicitly indicates required
 *     (asterisk, bold "required", "must", etc). Default false otherwise.
 *   - `placeholderText`: greyed-out hint text inside an input box.
 *     Physical / PDF forms almost never have this — omit if not visible.
 *   - `fieldInstruction`: helper text near the question, often in
 *     parentheses or italics, telling the user what to fill in. Omit if
 *     absent.
 */
const commonQuestionFields = {
  _id: z.string().uuid(),
  fieldLabel: z.string().default('Label'),
  questionValue: z.string(),
  isMandatory: z.boolean().default(false),
  placeholderText: z.string().optional(),
  fieldInstruction: z.string().optional(),
};

// ---------------------------------------------------------------------------
// Per-type question schemas
// ---------------------------------------------------------------------------

/** Short free-text answer (a single line of writing). */
export const SingleLineFieldSchema = z.object({
  ...commonQuestionFields,
  fieldType: z.literal('single-line'),
});

/** Long free-text answer (paragraph-style box). */
export const MultiLineFieldSchema = z.object({
  ...commonQuestionFields,
  fieldType: z.literal('multi-line'),
});

/**
 * Pick exactly one option from a list (radio buttons / circles).
 * `answerChoices` is the printed list of options.
 */
export const SingleSelectFieldSchema = z.object({
  ...commonQuestionFields,
  fieldType: z.literal('single-select'),
  answerChoices: z.array(z.string()).min(1),
  viewType: SelectViewType.default('list'),
});

/**
 * Pick one or more options from a list (checkbox list).
 * `answerChoices` is the printed list of options.
 */
export const MultiSelectFieldSchema = z.object({
  ...commonQuestionFields,
  fieldType: z.literal('multi-select'),
  answerChoices: z.array(z.string()).min(1),
  viewType: SelectViewType.default('list'),
});

/** Numeric-only answer (count, quantity, currency, etc). */
export const NumberFieldSchema = z.object({
  ...commonQuestionFields,
  fieldType: z.literal('number'),
});

/**
 * Pick a Location or Team from a directory. Digital-native — emit only
 * when a form explicitly asks for one of these.
 */
export const LookUpFieldSchema = z.object({
  ...commonQuestionFields,
  fieldType: z.literal('look-up'),
  lookUpAnsFieldType: LookUpAnsFieldType,
});

/** Date, with or without time. Default granularity is `dateOnly`. */
export const DateTimeFieldSchema = z.object({
  ...commonQuestionFields,
  fieldType: z.literal('date-time'),
  displayAs: DateTimeDisplayAs.default('dateOnly'),
});

/**
 * A person — this is the PDF signature equivalent on the platform.
 * Use this for "Signature", "Signed by", "Inspector", etc.
 */
export const UsersFieldSchema = z.object({
  ...commonQuestionFields,
  fieldType: z.literal('users'),
  viewType: UsersViewType.default('card'),
  selectionType: UsersSelectionType.default('singleUser'),
});

/** Attach a file. Digital-native; rare on physical forms. */
export const FileUploadFieldSchema = z.object({
  ...commonQuestionFields,
  fieldType: z.literal('fileUpload'),
});

/**
 * Attach or display an image. Use when the PDF has an image placeholder
 * the user is meant to fill (e.g., "photo of equipment"). Inline images
 * that are purely decorative should NOT become `image` fields.
 */
export const ImageFieldSchema = z.object({
  ...commonQuestionFields,
  fieldType: z.literal('image'),
});

/** GPS location capture. Digital-native; rare on PDFs. */
export const GeoLocationFieldSchema = z.object({
  ...commonQuestionFields,
  fieldType: z.literal('geoLocation'),
});

/** A web URL. Digital-native; rare on PDFs. */
export const UrlFieldSchema = z.object({
  ...commonQuestionFields,
  fieldType: z.literal('url'),
});

// ---------------------------------------------------------------------------
// Question union
// ---------------------------------------------------------------------------

/**
 * One question on the form. Discriminated by `fieldType` — extractors must
 * pick exactly one type per question. When in doubt between `single-line`
 * and something more specialised, prefer the specialised type only when
 * the form clearly signals it.
 */
export const QuestionFieldSchema = z.discriminatedUnion('fieldType', [
  SingleLineFieldSchema,
  MultiLineFieldSchema,
  SingleSelectFieldSchema,
  MultiSelectFieldSchema,
  NumberFieldSchema,
  LookUpFieldSchema,
  DateTimeFieldSchema,
  UsersFieldSchema,
  FileUploadFieldSchema,
  ImageFieldSchema,
  GeoLocationFieldSchema,
  UrlFieldSchema,
]);
export type QuestionField = z.infer<typeof QuestionFieldSchema>;

// ---------------------------------------------------------------------------
// Section + top-level form template
// ---------------------------------------------------------------------------

/**
 * One section of a form. Sections group related questions.
 *
 * - `_id`: generated UUID, not parsed from the form.
 * - `sectionHeading`: the printed header text on the form (e.g.
 *   "Personal Information", "Incident Details").
 * - `sectionCode`: required. Pick `SECTION_TYPE_BLANK_SECTION` for normal
 *   sections, `SECTION_TYPE_TABLE_SECTION` for repeating/tabular sections.
 * - `questionFields`: the ordered list of questions inside this section.
 */
export const FormTemplateSectionSchema = z.object({
  _id: z.string().uuid(),
  sectionHeading: z.string(),
  sectionCode: SectionCode,
  questionFields: z.array(QuestionFieldSchema),
});
export type FormTemplateSection = z.infer<typeof FormTemplateSectionSchema>;

/**
 * The top-level extraction target: a Cube form template.
 *
 * - `name`: the form's printed title in plain text.
 * - `description`: HTML-safe descriptive blurb — use the form's printed
 *   subtitle / preamble / purpose statement when present. Empty string
 *   is acceptable when the form has no explicit description.
 * - `template`: the ordered list of sections — the body of the form.
 */
export const FormTemplateSchema = z.object({
  name: z.string(),
  description: z.string(),
  template: z.array(FormTemplateSectionSchema),
});
export type FormTemplate = z.infer<typeof FormTemplateSchema>;
