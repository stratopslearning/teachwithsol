import { getTableColumns, type Table } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';

import {
  assignments,
  attempts,
  chatbotAssignments,
  chatbotSessions,
  interactiveProgress,
  questions,
  quizSections,
  quizzes,
  sections,
  hostedBooks,
} from '@/app/db/schema';
import * as old from './fixtures/legacyStudentMappers';
import { rowFromTable } from '@/lib/db/rowFromTable';

/** A full row with snake_case keys and string timestamps, as to_jsonb returns. */
function fullSnakeRow(table: Table): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  for (const [key, c] of Object.entries(getTableColumns(table))) {
    const col = c as unknown as { name: string; dataType: string; columnType: string };
    row[col.name] =
      col.dataType === 'date' ? '2026-03-01T10:00:00.000Z'
      : col.dataType === 'number' ? 7
      : col.dataType === 'boolean' ? true
      : col.dataType === 'json' ? { k: key }
      : col.dataType === 'array' ? ['a']
      : col.columnType === 'PgUUID' ? '11111111-1111-1111-1111-111111111111'
      : `v-${key}`;
  }
  return row;
}
function camelOf(table: Table, snake: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  for (const [key, c] of Object.entries(getTableColumns(table))) {
    out[key] = snake[(c as unknown as { name: string }).name];
  }
  return out;
}

const cases: Array<[string, Table, (raw: Record<string, unknown>) => unknown]> = [
  ['assignments', assignments, old.mapAssignment as never],
  ['quizzes', quizzes, old.mapQuiz as never],
  ['attempts', attempts, old.mapAttempt as never],
  ['quiz_sections', quizSections, old.mapQuizSection as never],
  ['questions', questions, old.mapQuestion as never],
  ['sections', sections, old.mapSection as never],
  ['interactive_progress', interactiveProgress, old.mapInteractiveProgress as never],
  ['chatbot_assignments', chatbotAssignments, old.mapChatbotAssignment as never],
  ['chatbot_sessions', chatbotSessions, old.mapChatbotSession as never],
];

describe.each(cases)('rowFromTable matches the hand mapper for %s', (_n, table, mapOld) => {
  it('full snake_case row', () => {
    const raw = fullSnakeRow(table);
    expect(rowFromTable(table, raw)).toEqual(mapOld(raw));
  });
  it('full camelCase row', () => {
    const raw = camelOf(table, fullSnakeRow(table));
    expect(rowFromTable(table, raw)).toEqual(mapOld(raw));
  });
  // Partial input only: the hand mappers turned missing ids into the string
  // "undefined" and ignored column defaults; rowFromTable uses '' and the
  // column's literal default. Everything else must match.
  it('sparse row (id only)', () => {
    const raw = { id: '11111111-1111-1111-1111-111111111111' };
    const next = rowFromTable(table, raw) as Record<string, unknown>;
    const prev = mapOld(raw) as Record<string, unknown>;
    const cols = getTableColumns(table) as Record<string, { default?: unknown }>;
    for (const key of Object.keys(prev)) {
      if (prev[key] === 'undefined') expect(['', cols[key]?.default], key).toContain(next[key]);
      else if (next[key] !== prev[key] && JSON.stringify(next[key]) !== JSON.stringify(prev[key])) {
        expect(next[key], key).toEqual(cols[key]?.default);
      }
    }
  });
});

// mapBook only ever received snake_case rows (to_jsonb of hosted_books).
describe('rowFromTable matches the hand mapper for hosted_books', () => {
  it('full snake_case row', () => {
    const raw = fullSnakeRow(hostedBooks);
    expect(rowFromTable(hostedBooks, raw)).toEqual(old.mapBook(raw));
  });
  it('nullable columns null, is_released missing', () => {
    const raw = { ...fullSnakeRow(hostedBooks), tenant_id: null, source_url: null, s3_key: null, error_message: null, deleted_at: null };
    delete (raw as Record<string, unknown>).is_released;
    expect(rowFromTable(hostedBooks, raw)).toEqual(old.mapBook(raw));
  });
});
