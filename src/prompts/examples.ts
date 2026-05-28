/**
 * USER WILL ITERATE ON THIS.
 *
 * Few-shot examples for template extraction. Kept short and deliberately
 * generic so they nudge structure without leaking AEC-specific bias.
 *
 * Use as: `messages: [system, ...FEW_SHOT_EXAMPLES, userTurn]`
 */

import type { ExtractedTemplate } from '../schema.js';

interface Example {
  description: string;
  output: ExtractedTemplate;
}

export const FEW_SHOT_EXAMPLES: Example[] = [
  {
    description:
      'A simple two-section employee onboarding form with a name, hire date, signature, and a required checkbox.',
    output: {
      name: 'Employee Onboarding',
      sections: [
        { id: 'personal', title: 'Personal Information', order: 0 },
        { id: 'agreement', title: 'Agreement', order: 1 },
      ],
      fields: [
        { id: 'full-name', label: 'Full Name', type: 'text', required: true, sectionId: 'personal' },
        { id: 'hire-date', label: 'Hire Date', type: 'date', required: true, sectionId: 'personal' },
        { id: 'department', label: 'Department', type: 'text', required: false, sectionId: 'personal' },
        {
          id: 'agree-policy',
          label: 'I agree to the company policy',
          type: 'checkbox',
          required: true,
          sectionId: 'agreement',
        },
        { id: 'signature', label: 'Signature', type: 'signature', required: true, sectionId: 'agreement' },
      ],
    },
  },
];
