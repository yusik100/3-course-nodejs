/**
 * Типізована обгортка над `sql-template-tag` (ADR-0003).
 *
 * Пакет типізує значення як `unknown`, а `node:sqlite` приймає лише `null | number | bigint | string | ArrayBufferView`,
 * тому модулі імпортують `sql`/`join`/`empty` звідси, а не з пакета. `raw()` свідомо не експортується:
 * динамічні ідентифікатори дозволені лише через whitelist (spec-02, §1).
 */

import template, { empty, join, type Sql } from 'sql-template-tag';

export type { Sql };
export { empty, join };

export type SqlValue = null | number | bigint | string | Uint8Array;

export const sql = (strings: TemplateStringsArray, ...values: readonly (SqlValue | Sql)[]): Sql =>
  template(strings, ...values);
