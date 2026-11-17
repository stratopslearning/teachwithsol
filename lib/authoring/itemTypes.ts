/**
 * Outline item type registry: the facts about each authored item type that
 * used to be repeated across authoring, LMS modules and the UI.
 */
import { OUTLINE_ITEM_TYPES, type OutlineItemType } from '@/app/db/enums';

export { OUTLINE_ITEM_TYPES, type OutlineItemType };

type ItemTypeInfo = {
  label: string;
  /** Module item type in the LMS (a discussion runs as the AI tutor). */
  moduleItemType: 'LESSON' | 'QUIZ' | 'TUTOR' | 'INTERACTIVE';
  /** Order inside a generated module: lessons first, discussions last. */
  moduleSortKey: number;
};

export const ITEM_TYPES: Record<OutlineItemType, ItemTypeInfo> = {
  LESSON: { label: 'Lesson', moduleItemType: 'LESSON', moduleSortKey: 0 },
  QUIZ: { label: 'Quiz', moduleItemType: 'QUIZ', moduleSortKey: 1 },
  INTERACTIVE: { label: 'Interactive', moduleItemType: 'INTERACTIVE', moduleSortKey: 2 },
  DISCUSSION: { label: 'Discussion', moduleItemType: 'TUTOR', moduleSortKey: 3 },
};

export function isOutlineItemType(type: string): type is OutlineItemType {
  return (OUTLINE_ITEM_TYPES as readonly string[]).includes(type);
}
