/**
 * Placeholder ExtractedTemplate Zod schema.
 *
 * The project owner will replace this file with the production schema.
 * Every adapter and scoring function imports from this file; swapping the
 * schema is intended to be a one-file change.
 *
 * If you must change the placeholder during development, ask the user first.
 */

import { z } from 'zod';

export const FieldTypeEnum = z.enum([
  'text',
  'number',
  'date',
  'checkbox',
  'signature',
  'select',
  'multiselect',
  'table',
]);

export type FieldType = z.infer<typeof FieldTypeEnum>;

export const FieldSchema = z.object({
  id: z.string(),
  label: z.string(),
  type: FieldTypeEnum,
  required: z.boolean().default(false),
  sectionId: z.string().optional(),
  options: z.array(z.string()).optional(),
  hint: z.string().optional(),
});

export const SectionSchema = z.object({
  id: z.string(),
  title: z.string(),
  order: z.number(),
});

export const ExtractedTemplateSchema = z.object({
  name: z.string(),
  sections: z.array(SectionSchema),
  fields: z.array(FieldSchema),
});

export type ExtractedTemplate = z.infer<typeof ExtractedTemplateSchema>;
export type Field = z.infer<typeof FieldSchema>;
export type Section = z.infer<typeof SectionSchema>;
