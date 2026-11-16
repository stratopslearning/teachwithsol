import { z } from 'zod';

/** Module item completion rule (matches ModuleItemRow['completionRequirement']). */
export const completionRequirementSchema = z.object({
  type: z.enum(['view', 'submit', 'score_at_least']),
  minPercent: z.number().optional(),
});
