import { listCourseRubricsDefiner, upsertCourseRubricDefiner } from '@/lib/db/lmsDefiners';
import { lmsCollectionRoutes } from '@/lib/lms/collectionRoutes';

export const dynamic = 'force-dynamic';

const routes = lmsCollectionRoutes({
  listKey: 'rubrics',
  itemKey: 'rubric',
  list: listCourseRubricsDefiner,
  upsert: upsertCourseRubricDefiner,
});
export const GET = routes.GET;
export const POST = routes.POST;
