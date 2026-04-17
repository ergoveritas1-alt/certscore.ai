import type { QueryResultRow } from "pg";
import { query } from "./postgres";

type QueryError = {
  code?: string;
  details?: string;
  hint?: string;
  message: string;
};

type QueryResponse<T = unknown> = {
  count: number | null;
  data: T;
  error: QueryError | null;
};

type OrderSpec = {
  ascending?: boolean;
  column: string;
};

type PendingOperation = "delete" | "insert" | "select" | "update" | "upsert";

type UpsertOptions = {
  ignoreDuplicates?: boolean;
  onConflict?: string;
};

type SelectOptions = {
  count?: "exact";
  head?: boolean;
};

function buildError(error: unknown): QueryError {
  if (error && typeof error === "object") {
    const record = error as { code?: string; detail?: string; hint?: string; message?: string };
    return {
      code: record.code,
      details: record.detail,
      hint: record.hint,
      message: record.message ?? "Unknown database error."
    };
  }

  return {
    message: error instanceof Error ? error.message : "Unknown database error."
  };
}

function quoteIdentifier(identifier: string) {
  return `"${identifier.replace(/"/g, "\"\"")}"`;
}

function quoteQualifiedIdentifier(identifier: string) {
  return identifier
    .split(".")
    .map((part) => quoteIdentifier(part.trim()))
    .join(".");
}

function normalizeSelectColumns(columns: string) {
  const trimmed = columns.trim();
  if (trimmed === "*" || trimmed.length === 0) {
    return "*";
  }

  return trimmed
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      if (part === "*") {
        return "*";
      }

      return quoteQualifiedIdentifier(part);
    })
    .join(", ");
}

function parsePrimitiveValue(value: string) {
  if (value === "null") {
    return null;
  }

  if (value === "true") {
    return true;
  }

  if (value === "false") {
    return false;
  }

  if (/^-?\d+(\.\d+)?$/.test(value)) {
    return Number(value);
  }

  return value;
}

function splitCsvLike(value: string) {
  const parts: string[] = [];
  let current = "";
  let inQuotes = false;

  for (const char of value) {
    if (char === '"') {
      inQuotes = !inQuotes;
      current += char;
      continue;
    }

    if (char === "," && !inQuotes) {
      parts.push(current);
      current = "";
      continue;
    }

    current += char;
  }

  if (current.length > 0) {
    parts.push(current);
  }

  return parts.map((part) => part.trim()).filter(Boolean);
}

function parseParenthesizedList(value: string) {
  const trimmed = value.trim().replace(/^\(/, "").replace(/\)$/, "");
  return splitCsvLike(trimmed).map((part) => parsePrimitiveValue(part.replace(/^"|"$/g, "")));
}

export class PostgrestQueryBuilder<T = QueryResultRow, TResult = T[]>
  implements PromiseLike<QueryResponse<TResult>>
{
  private countMode: "exact" | null = null;
  private filters: Array<{ clause: string; values: unknown[] }> = [];
  private head = false;
  private limitValue: number | null = null;
  private offsetValue: number | null = null;
  private operation: PendingOperation = "select";
  private orderSpecs: OrderSpec[] = [];
  private payload: Record<string, unknown> | Record<string, unknown>[] | null = null;
  private selectColumns = "*";
  private singleMode: "maybe" | "strict" | null = null;
  private upsertOptions: UpsertOptions = {};

  constructor(private readonly table: string) {}

  select(columns = "*", options?: SelectOptions) {
    this.selectColumns = columns;
    this.countMode = options?.count ?? null;
    this.head = options?.head ?? false;
    return this;
  }

  insert(payload: Record<string, unknown> | Record<string, unknown>[]) {
    this.operation = "insert";
    this.payload = payload;
    return this;
  }

  update(payload: Record<string, unknown>) {
    this.operation = "update";
    this.payload = payload;
    return this;
  }

  delete() {
    this.operation = "delete";
    return this;
  }

  upsert(payload: Record<string, unknown> | Record<string, unknown>[], options: UpsertOptions = {}) {
    this.operation = "upsert";
    this.payload = payload;
    this.upsertOptions = options;
    return this;
  }

  eq(column: string, value: unknown) {
    return this.where(`${quoteQualifiedIdentifier(column)} = $%INDEX%`, [value]);
  }

  neq(column: string, value: unknown) {
    return this.where(`${quoteQualifiedIdentifier(column)} <> $%INDEX%`, [value]);
  }

  gt(column: string, value: unknown) {
    return this.where(`${quoteQualifiedIdentifier(column)} > $%INDEX%`, [value]);
  }

  gte(column: string, value: unknown) {
    return this.where(`${quoteQualifiedIdentifier(column)} >= $%INDEX%`, [value]);
  }

  lt(column: string, value: unknown) {
    return this.where(`${quoteQualifiedIdentifier(column)} < $%INDEX%`, [value]);
  }

  lte(column: string, value: unknown) {
    return this.where(`${quoteQualifiedIdentifier(column)} <= $%INDEX%`, [value]);
  }

  like(column: string, value: string) {
    return this.where(`${quoteQualifiedIdentifier(column)} like $%INDEX%`, [value]);
  }

  ilike(column: string, value: string) {
    return this.where(`${quoteQualifiedIdentifier(column)} ilike $%INDEX%`, [value]);
  }

  in(column: string, values: unknown[]) {
    return this.where(`${quoteQualifiedIdentifier(column)} = any($%INDEX%)`, [values]);
  }

  is(column: string, value: unknown) {
    if (value === null) {
      return this.where(`${quoteQualifiedIdentifier(column)} is null`, []);
    }

    return this.where(`${quoteQualifiedIdentifier(column)} is not distinct from $%INDEX%`, [value]);
  }

  not(column: string, operator: string, value: unknown) {
    if (operator === "is") {
      return value === null
        ? this.where(`${quoteQualifiedIdentifier(column)} is not null`, [])
        : this.where(`not (${quoteQualifiedIdentifier(column)} is not distinct from $%INDEX%)`, [value]);
    }

    if (operator === "in" && typeof value === "string") {
      return this.where(`not (${quoteQualifiedIdentifier(column)} = any($%INDEX%))`, [parseParenthesizedList(value)]);
    }

    if (operator === "eq") {
      return this.where(`${quoteQualifiedIdentifier(column)} <> $%INDEX%`, [value]);
    }

    throw new Error(`Unsupported not() operator: ${operator}`);
  }

  or(expression: string) {
    const parts = splitCsvLike(expression);
    const clauses: string[] = [];
    const values: unknown[] = [];

    for (const part of parts) {
      const segments = part.split(".");
      const [rawColumn, operator, ...rest] = segments;
      if (!rawColumn || !operator) {
        throw new Error(`Unsupported or() expression: ${part}`);
      }
      const column = quoteQualifiedIdentifier(rawColumn);
      const rawValue = rest.join(".");
      const value = parsePrimitiveValue(rawValue);

      switch (operator) {
        case "eq":
          clauses.push(`${column} = $%INDEX%`);
          values.push(value);
          break;
        case "lt":
          clauses.push(`${column} < $%INDEX%`);
          values.push(value);
          break;
        case "gt":
          clauses.push(`${column} > $%INDEX%`);
          values.push(value);
          break;
        case "is":
          clauses.push(value === null ? `${column} is null` : `${column} is not distinct from $%INDEX%`);
          if (value !== null) {
            values.push(value);
          }
          break;
        default:
          throw new Error(`Unsupported or() operator: ${operator}`);
      }
    }

    return this.where(`(${clauses.join(" or ")})`, values);
  }

  match(criteria: Record<string, unknown>) {
    for (const [key, value] of Object.entries(criteria)) {
      this.eq(key, value);
    }
    return this;
  }

  order(
    column: string,
    options?: {
      ascending?: boolean;
      nullsFirst?: boolean;
      referencedTable?: string;
    }
  ) {
    this.orderSpecs.push({
      ascending: options?.ascending ?? true,
      column
    });
    return this;
  }

  limit(value: number) {
    this.limitValue = value;
    return this;
  }

  range(from: number, to: number) {
    this.offsetValue = from;
    this.limitValue = to - from + 1;
    return this;
  }

  single(): PostgrestQueryBuilder<T, T | null> {
    this.singleMode = "strict";
    this.limitValue = 1;
    return this as unknown as PostgrestQueryBuilder<T, T | null>;
  }

  maybeSingle(): PostgrestQueryBuilder<T, T | null> {
    this.singleMode = "maybe";
    this.limitValue = 1;
    return this as unknown as PostgrestQueryBuilder<T, T | null>;
  }

  then<TResult1 = QueryResponse<TResult>, TResult2 = never>(
    onfulfilled?: ((value: QueryResponse<TResult>) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ): Promise<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected);
  }

  private where(clause: string, values: unknown[]) {
    this.filters.push({ clause, values });
    return this;
  }

  private buildWhereClause() {
    if (this.filters.length === 0) {
      return { sql: "", values: [] as unknown[] };
    }

    const values: unknown[] = [];
    let index = 1;
    const clauses = this.filters.map((filter) => {
      const rewritten = filter.clause.replace(/\$%INDEX%/g, () => `$${index++}`);
      values.push(...filter.values);
      return rewritten;
    });

    return {
      sql: ` where ${clauses.join(" and ")}`,
      values
    };
  }

  private buildOrderClause() {
    if (this.orderSpecs.length === 0) {
      return "";
    }

    return ` order by ${this.orderSpecs
      .map((spec) => `${quoteQualifiedIdentifier(spec.column)} ${spec.ascending === false ? "desc" : "asc"}`)
      .join(", ")}`;
  }

  private buildLimitClause(nextIndex: number) {
    const values: unknown[] = [];
    const clauses: string[] = [];
    let index = nextIndex;

    if (typeof this.limitValue === "number") {
      clauses.push(`limit $${index++}`);
      values.push(this.limitValue);
    }

    if (typeof this.offsetValue === "number") {
      clauses.push(`offset $${index++}`);
      values.push(this.offsetValue);
    }

    return {
      sql: clauses.length > 0 ? ` ${clauses.join(" ")}` : "",
      values
    };
  }

  private async executeSelect() {
    const whereClause = this.buildWhereClause();
    const countPromise =
      this.countMode === "exact"
        ? query<{ count: string }>(
            `select count(*)::text as count from ${quoteQualifiedIdentifier(this.table)}${whereClause.sql}`,
            whereClause.values,
            { readOnly: true }
          )
        : Promise.resolve(null);

    const limitClause = this.buildLimitClause(whereClause.values.length + 1);
    const sql = this.head
      ? null
      : `select ${normalizeSelectColumns(this.selectColumns)} from ${quoteQualifiedIdentifier(this.table)}${whereClause.sql}${this.buildOrderClause()}${limitClause.sql}`;

    const [countResult, result] = await Promise.all([
      countPromise,
      sql ? query<QueryResultRow>(sql, [...whereClause.values, ...limitClause.values], { readOnly: true }) : Promise.resolve(null)
    ]);

    const count = countResult ? Number(countResult.rows[0]?.count ?? 0) : null;
    const rows = (result?.rows ?? []) as T[];
    return this.finalizeRows(rows, count);
  }

  private async executeInsertLike(mode: "insert" | "upsert"): Promise<QueryResponse<TResult>> {
    const rows = Array.isArray(this.payload) ? this.payload : this.payload ? [this.payload] : [];
    if (rows.length === 0) {
      return { count: null, data: [] as TResult, error: null };
    }

    const columns = Array.from(new Set(rows.flatMap((row) => Object.keys(row))));
    const values: unknown[] = [];
    const valueGroups = rows.map((row) => {
      const placeholders = columns.map((column) => {
        values.push((row as Record<string, unknown>)[column] ?? null);
        return `$${values.length}`;
      });
      return `(${placeholders.join(", ")})`;
    });

    const returning = this.head ? "" : ` returning ${normalizeSelectColumns(this.selectColumns)}`;
    let sql = `insert into ${quoteQualifiedIdentifier(this.table)} (${columns.map(quoteIdentifier).join(", ")}) values ${valueGroups.join(", ")}`;

    if (mode === "upsert" && this.upsertOptions.onConflict) {
      const conflictColumns = this.upsertOptions.onConflict.split(",").map((column) => column.trim()).filter(Boolean);
      const nonConflictColumns = columns.filter((column) => !conflictColumns.includes(column));
      sql += ` on conflict (${conflictColumns.map(quoteIdentifier).join(", ")})`;
      if (this.upsertOptions.ignoreDuplicates) {
        sql += " do nothing";
      } else {
        const updateColumns = nonConflictColumns.length > 0 ? nonConflictColumns : columns;
        sql += ` do update set ${updateColumns.map((column) => `${quoteIdentifier(column)} = excluded.${quoteIdentifier(column)}`).join(", ")}`;
      }
    }

    sql += returning;
    const result = await query<QueryResultRow>(sql, values);
    return this.finalizeRows(result.rows as T[], null);
  }

  private async executeUpdate(): Promise<QueryResponse<TResult>> {
    const payload = this.payload as Record<string, unknown> | null;
    if (!payload) {
      return { count: null, data: [] as TResult, error: null };
    }

    const entries = Object.entries(payload);
    const setValues: unknown[] = [];
    const setClause = entries
      .map(([column, value], index) => {
        setValues.push(value);
        return `${quoteIdentifier(column)} = $${index + 1}`;
      })
      .join(", ");
    const whereClause = this.buildWhereClause();
    const rewrittenWhere = whereClause.sql.replace(/\$(\d+)/g, (_, value) => `$${Number(value) + setValues.length}`);
    const returning = this.head ? "" : ` returning ${normalizeSelectColumns(this.selectColumns)}`;
    const sql = `update ${quoteQualifiedIdentifier(this.table)} set ${setClause}${rewrittenWhere}${returning}`;
    const result = await query<QueryResultRow>(sql, [...setValues, ...whereClause.values]);
    return this.finalizeRows(result.rows as T[], null);
  }

  private async executeDelete(): Promise<QueryResponse<TResult>> {
    const whereClause = this.buildWhereClause();
    const returning = this.head ? "" : ` returning ${normalizeSelectColumns(this.selectColumns)}`;
    const sql = `delete from ${quoteQualifiedIdentifier(this.table)}${whereClause.sql}${returning}`;
    const result = await query<QueryResultRow>(sql, whereClause.values);
    return this.finalizeRows(result.rows as T[], null);
  }

  private finalizeRows(rows: T[], count: number | null): QueryResponse<TResult> {
    if (this.singleMode === "strict") {
      if (rows.length !== 1) {
        return {
          count,
          data: null as TResult,
          error: {
            message: rows.length === 0 ? "JSON object requested, multiple (or no) rows returned" : "JSON object requested, multiple rows returned"
          }
        };
      }

      return {
        count,
        data: (rows[0] ?? null) as TResult,
        error: null
      };
    }

    if (this.singleMode === "maybe") {
      if (rows.length > 1) {
        return {
          count,
          data: null as TResult,
          error: {
            message: "JSON object requested, multiple rows returned"
          }
        };
      }

      return {
        count,
        data: (rows[0] ?? null) as TResult,
        error: null
      };
    }

    return {
      count,
      data: rows as TResult,
      error: null
    };
  }

  private async execute(): Promise<QueryResponse<TResult>> {
    try {
      switch (this.operation) {
        case "select":
          return await this.executeSelect();
        case "insert":
          return await this.executeInsertLike("insert");
        case "upsert":
          return await this.executeInsertLike("upsert");
        case "update":
          return await this.executeUpdate();
        case "delete":
          return await this.executeDelete();
        default:
          throw new Error(`Unsupported operation: ${this.operation satisfies never}`);
      }
    } catch (error) {
      return {
        count: null,
        data: (this.singleMode ? null : []) as TResult,
        error: buildError(error)
      };
    }
  }
}

export type PostgrestCompatClient = {
  from<T = QueryResultRow>(table: string): PostgrestQueryBuilder<T, T[]>;
};

export function createPostgrestCompatClient(): PostgrestCompatClient {
  return {
    from<T = QueryResultRow>(table: string) {
      return new PostgrestQueryBuilder<T, T[]>(table);
    }
  };
}
