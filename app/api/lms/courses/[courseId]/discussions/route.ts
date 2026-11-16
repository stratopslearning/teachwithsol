import {
  listPeerDiscussionsDefiner,
  upsertPeerDiscussionDefiner,
} from '@/lib/db/lmsDefiners';
import { lmsCollectionRoutes } from '@/lib/lms/collectionRoutes';

export const dynamic = 'force-dynamic';

const routes = lmsCollectionRoutes({
  listKey: 'discussions',
  itemKey: 'discussion',
  list: listPeerDiscussionsDefiner,
  upsert: upsertPeerDiscussionDefiner,
  stampCreator: true,
});
export const GET = routes.GET;
export const POST = routes.POST;
