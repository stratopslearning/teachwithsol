import { listCoursePagesDefiner, upsertCoursePageDefiner } from '@/lib/db/lmsDefiners';
import { lmsCollectionRoutes } from '@/lib/lms/collectionRoutes';

export const dynamic = 'force-dynamic';

const routes = lmsCollectionRoutes({
  listKey: 'pages',
  itemKey: 'page',
  list: listCoursePagesDefiner,
  upsert: upsertCoursePageDefiner,
});
export const GET = routes.GET;
export const POST = routes.POST;
