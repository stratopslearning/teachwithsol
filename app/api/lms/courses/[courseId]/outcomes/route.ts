import {
  listLearningOutcomesDefiner,
  upsertLearningOutcomeDefiner,
} from '@/lib/db/lmsDefiners';
import { lmsCollectionRoutes } from '@/lib/lms/collectionRoutes';

export const dynamic = 'force-dynamic';

const routes = lmsCollectionRoutes({
  listKey: 'outcomes',
  itemKey: 'outcome',
  list: listLearningOutcomesDefiner,
  upsert: upsertLearningOutcomeDefiner,
});
export const GET = routes.GET;
export const POST = routes.POST;
