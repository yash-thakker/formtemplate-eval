/**
 * USER WILL ITERATE ON THIS.
 *
 * Few-shot examples for template extraction. Kept short and deliberately
 * generic so they nudge structure without leaking AEC-specific bias.
 *
 * Currently unused — adapters call generateObject zero-shot. Add to the
 * messages array in llm-shared.ts if you want to wire them in.
 */

import type { FormTemplate } from '../schema.js';

interface Example {
  description: string;
  output: FormTemplate;
}

export const FEW_SHOT_EXAMPLES: Example[] = [
  {
    description:
      'A simple two-section employee onboarding form with a name, hire date, signature, and a required checkbox.',
    output: {
      name: 'Employee Onboarding',
      description: '',
      template: [
        {
          _id: '00000000-0000-0000-0000-000000000001',
          sectionHeading: 'Personal Information',
          sectionCode: 'SECTION_TYPE_BLANK_SECTION',
          questionFields: [
            {
              _id: '00000000-0000-0000-0000-000000000002',
              fieldType: 'single-line',
              fieldLabel: 'Label',
              questionValue: 'Full Name',
              isMandatory: true,
            },
            {
              _id: '00000000-0000-0000-0000-000000000003',
              fieldType: 'date-time',
              fieldLabel: 'Label',
              questionValue: 'Hire Date',
              isMandatory: true,
              displayAs: 'dateOnly',
            },
            {
              _id: '00000000-0000-0000-0000-000000000004',
              fieldType: 'single-line',
              fieldLabel: 'Label',
              questionValue: 'Department',
              isMandatory: false,
            },
          ],
        },
        {
          _id: '00000000-0000-0000-0000-000000000005',
          sectionHeading: 'Agreement',
          sectionCode: 'SECTION_TYPE_BLANK_SECTION',
          questionFields: [
            {
              _id: '00000000-0000-0000-0000-000000000006',
              fieldType: 'single-select',
              fieldLabel: 'Label',
              questionValue: 'I agree to the company policy',
              isMandatory: true,
              answerChoices: ['Yes', 'No'],
              viewType: 'list',
            },
            {
              _id: '00000000-0000-0000-0000-000000000007',
              fieldType: 'users',
              fieldLabel: 'Label',
              questionValue: 'Signature',
              isMandatory: true,
              viewType: 'card',
              selectionType: 'singleUser',
            },
          ],
        },
      ],
    },
  },
];
