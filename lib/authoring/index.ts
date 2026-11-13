export {
  assertCanManageOutline,
  assertCanManageItem,
  listTeachableSectionIdsForCourse,
} from '@/lib/authoring/access';
export {
  assertCourseHasReadyMaterials,
  buildAuthoringMaterialsContext,
  getCourseAuthoringMaterialStats,
  searchCourseMaterialsForAuthoring,
} from '@/lib/authoring/context';
export {
  generateCourseOutline,
  generateOutlineFromContext,
  parseGeneratedOutline,
  toPersistModules,
} from '@/lib/authoring/generate';
export {
  proposeOutlineSkeleton,
  approveAndBuildOutline,
} from '@/lib/authoring/propose';
export {
  ensureInteractiveLessonsForOutline,
  outlineNeedsInteractiveLessons,
} from '@/lib/authoring/ensureLessons';
export {
  createAuthoringRevision,
  listAuthoringRevisions,
  restoreAuthoringRevision,
} from '@/lib/authoring/revisions';
export {
  proposeSwitchUp,
  acceptSwitchUp,
  textSimilarity,
  itemBodySimilarity,
} from '@/lib/authoring/switchUp';
export { runRolloverChecks } from '@/lib/authoring/rolloverChecks';
export { copyOfferingFromSource } from '@/lib/authoring/copyOffering';
export { cloneCourseKnowledgeLinks } from '@/lib/knowledge/documents';
export {
  getAuthoringPolicyForCourse,
  getAuthoringPolicyForWorkspace,
  upsertAuthoringPolicy,
  getAuthoringPolicyForManagedCourse,
} from '@/lib/authoring/policies';
export {
  AUTHORING_OUTLINE_SYSTEM_PROMPT,
  AUTHORING_REFINE_SYSTEM_PROMPT,
  defaultAuthoringQuery,
} from '@/lib/authoring/prompts';
export {
  listOutlinesForCourse,
  getCurrentOutlineForCourse,
  getOutlineDetail,
  archiveOutline,
  restoreOutlineAsCurrent,
  updateOutlineMeta,
  updateOutlineItem,
  listAuthoringMessages,
  type AuthoringSessionSummary,
  type OutlineDetail,
  type OutlineItemSummary,
  type OutlineModuleSummary,
} from '@/lib/authoring/outlines';
export { refineOutlineChat } from '@/lib/authoring/refine';
export { previewOutlineItem, type ItemPreview } from '@/lib/authoring/preview';
export {
  publishOutlineItem,
  publishOutlineItems,
  releaseOutlineItem,
  type PublishItemsResult,
} from '@/lib/authoring/publish';
