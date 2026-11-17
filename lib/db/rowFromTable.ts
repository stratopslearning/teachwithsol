/**
 * Map a row returned by a SECURITY DEFINER function (to_jsonb / row_to_json,
 * snake_case or camelCase keys, timestamps as strings) onto a table's
 * `$inferSelect` shape, using the table's column definitions.
 *
 * Missing / null values for NOT NULL columns fall back to the column's
 * literal default, else to '' / 0 / false / epoch, matching the hand-written
 * mappers this replaces (tests/unit/rowFromTable.test.ts compares them).
 */
import { getTableColumns, type InferSelectModel, type Table } from 'drizzle-orm';

import { asDate } from '@/lib/db/rows';

type ColumnMeta = {
  name: string;
  dataType: string;
  notNull: boolean;
  default: unknown;
};

function literalDefault(col: ColumnMeta): unknown {
  const d = col.default;
  if (d === undefined || d === null) return undefined;
  if (typeof d === 'object' && !Array.isArray(d) && 'queryChunks' in (d as object)) return undefined; // SQL default (now(), gen_random_uuid())
  return d;
}

export function rowFromTable<T extends Table>(
  table: T,
  raw: Record<string, unknown>,
): InferSelectModel<T> {
  const out: Record<string, unknown> = {};
  for (const [key, c] of Object.entries(getTableColumns(table))) {
    const col = c as unknown as ColumnMeta;
    const v = key in raw ? raw[key] : raw[col.name];
    const fallback = literalDefault(col);
    switch (col.dataType) {
      case 'date': {
        const d = asDate(v as Date | string | null | undefined);
        out[key] = d ?? (col.notNull ? new Date(0) : null);
        break;
      }
      case 'number':
        out[key] =
          v == null || v === ''
            ? col.notNull
              ? (fallback as number | undefined) ?? 0
              : null
            : Number(v);
        break;
      case 'boolean':
        out[key] = v == null ? (col.notNull ? (fallback as boolean | undefined) ?? false : null) : Boolean(v);
        break;
      case 'string':
        out[key] = v == null ? (col.notNull ? (fallback as string | undefined) ?? '' : null) : String(v);
        break;
      default: // json / array
        out[key] =
          v === undefined || v === null
            ? col.notNull
              ? fallback ?? (col.dataType === 'array' ? [] : {})
              : null
            : v;
    }
  }
  return out as InferSelectModel<T>;
}
