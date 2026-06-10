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

// ---------------------------------------------------------------------------
// Common question-field shape (shared by every fieldType variant)
// ---------------------------------------------------------------------------

/**
 * Fields shared by every question regardless of `fieldType`.
 *
 * Extraction guidance:
 *   - `_id`: generate a fresh UUID for every question. Not parsed from form.
 *   - `fieldLabel`: a UI label string (the platform shows it next to the
 *     input). On PDFs this is usually not visible content
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
// Section types
// ---------------------------------------------------------------------------

/**
 * A label-only column header in a table section. Used when the column axis
 * is categorical (each column names a record / role / party) and the row
 * axis carries the field types. Contains only `_id` and `questionValue` —
 * no fieldType, no isMandatory, no fieldLabel.
 */
export const ColumnHeaderSchema = z.object({
  _id: z.string().uuid(),
  questionValue: z.string(),
});
export type ColumnHeader = z.infer<typeof ColumnHeaderSchema>;

/** Items inside a TableSection's columnFields: either typed columns or label-only headers. */
export const ColumnEntrySchema = z.union([QuestionFieldSchema, ColumnHeaderSchema]);
export type ColumnEntry = z.infer<typeof ColumnEntrySchema>;

/**
 * Type guard: did this entry come from QuestionFieldSchema (typed) rather
 * than ColumnHeaderSchema (label-only)?
 */
export function isTypedEntry(entry: ColumnEntry | QuestionField): entry is QuestionField {
  return 'fieldType' in entry;
}

/**
 * A normal section — an ordered list of questions stacked vertically.
 *
 * Use this for almost every section on a form. Switch to a table section
 * only when the form has an actual grid of inputs (rows × columns).
 */
export const BlankSectionSchema = z.object({
  _id: z.string().uuid(),
  sectionHeading: z.string(),
  sectionCode: z.literal('SECTION_TYPE_BLANK_SECTION'),
  questionFields: z.array(QuestionFieldSchema),
});
export type BlankSection = z.infer<typeof BlankSectionSchema>;

/**
 * A table section — a grid of inputs.
 *
 * Convention: **the row axis defines the cell type.** When both axes are
 * populated, columns are categorical headers (one record per column) and
 * each row of `rowFields` defines what to capture for every record.
 *
 * Three real-world shapes you'll see:
 *
 *   1. Columns are fields, rows are unlabeled records (e.g., a coordinate
 *      table whose rows the user fills in at runtime):
 *        columnFields: [<typed QuestionField per column>]
 *        rowFields: []
 *
 *   2. Rows are fields, columns are categorical (e.g., a signature table
 *      whose columns name the 4 parties signing):
 *        columnFields: [<ColumnHeader per party — _id + questionValue only>]
 *        rowFields: [<typed QuestionField per row>]
 *
 *   3. Both axes are categorical (rare, e.g., a yes/no matrix). Rare enough
 *      that extractors should default to (2) for ambiguous cases.
 */
export const TableSectionSchema = z.object({
  _id: z.string().uuid(),
  sectionHeading: z.string(),
  sectionCode: z.literal('SECTION_TYPE_TABLE_SECTION'),
  columnFields: z.array(ColumnEntrySchema),
  rowFields: z.array(QuestionFieldSchema),
});
export type TableSection = z.infer<typeof TableSectionSchema>;

export const FormTemplateSectionSchema = z.discriminatedUnion('sectionCode', [
  BlankSectionSchema,
  TableSectionSchema,
]);
export type FormTemplateSection = z.infer<typeof FormTemplateSectionSchema>;

/**
 * The top-level extraction target: a Cube form template.
 *
 * Only `template` is scored. The platform's full FormTemplate object has
 * additional fields (name, description) but those are out of scope for this
 * eval — extractors only need to produce the body of the form.
 *
 * - `template`: the ordered list of sections — the body of the form.
 */
export const FormTemplateSchema = z.object({
  template: z.array(FormTemplateSectionSchema),
});
export type FormTemplate = z.infer<typeof FormTemplateSchema>;
