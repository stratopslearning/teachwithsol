import {
  listAssignmentGroupsDefiner,
  upsertAssignmentGroupDefiner,
} from '@/lib/db/lmsDefiners';
import { lmsCollectionRoutes } from '@/lib/lms/collectionRoutes';

export const dynamic = 'force-dynamic';

const routes = lmsCollectionRoutes({
  listKey: 'groups',
  itemKey: 'group',
  list: listAssignmentGroupsDefiner,
  upsert: upsertAssignmentGroupDefiner,
});
export const GET = routes.GET;
export const POST = routes.POST;
