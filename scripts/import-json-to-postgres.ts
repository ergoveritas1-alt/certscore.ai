import { readFile } from "node:fs/promises";
import path from "node:path";
import { Client, type ClientConfig } from "pg";

const DEFAULT_INPUT_DIR = path.resolve(process.cwd(), "tmp/supabase-export");
const DEFAULT_CHUNK_ROWS = 1000;

type ManifestFile = {
  manifest: Array<{
    count: number | null;
    exportedRows?: number;
    file?: string;
    table: string;
  }>;
};

type ForeignKeyEdge = {
  child_table: string;
  parent_table: string;
};

type SequenceRow = {
  column_name: string;
  sequence_name: string;
  table_name: string;
};

function getRequiredEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Set ${name}.`);
  }

  return value;
}

function getOptionalEnv(name: string) {
  const value = process.env[name]?.trim();
  return value && value.length > 0 ? value : null;
}

function getSslConfig(mode: string | undefined): ClientConfig["ssl"] {
  switch (mode) {
    case "disable":
      return false;
    case "prefer":
      return undefined;
    case "require":
      return { rejectUnauthorized: false };
    case "verify-ca":
    case "verify-full":
      return { rejectUnauthorized: true };
    default:
      return undefined;
  }
}

function quoteIdentifier(identifier: string) {
  return `"${identifier.replace(/"/g, "\"\"")}"`;
}

function topologicalSortTables(tables: string[], edges: ForeignKeyEdge[]) {
  const tableSet = new Set(tables);
  const inDegree = new Map<string, number>(tables.map((table) => [table, 0]));
  const graph = new Map<string, string[]>();

  for (const table of tables) {
    graph.set(table, []);
  }

  for (const edge of edges) {
    if (!tableSet.has(edge.child_table) || !tableSet.has(edge.parent_table)) {
      continue;
    }

    graph.get(edge.parent_table)?.push(edge.child_table);
    inDegree.set(edge.child_table, (inDegree.get(edge.child_table) ?? 0) + 1);
  }

  const queue = tables.filter((table) => (inDegree.get(table) ?? 0) === 0).sort((a, b) => a.localeCompare(b));
  const ordered: string[] = [];

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) {
      break;
    }

    ordered.push(current);

    for (const next of graph.get(current) ?? []) {
      const nextDegree = (inDegree.get(next) ?? 0) - 1;
      inDegree.set(next, nextDegree);
      if (nextDegree === 0) {
        queue.push(next);
        queue.sort((a, b) => a.localeCompare(b));
      }
    }
  }

  if (ordered.length !== tables.length) {
    throw new Error(
      `Could not determine a full import order. Remaining tables: ${tables.filter((table) => !ordered.includes(table)).join(", ")}`
    );
  }

  return ordered;
}

function computeImportOrder(tables: string[], edges: ForeignKeyEdge[]) {
  const tableSet = new Set(tables);
  const inDegree = new Map<string, number>(tables.map((table) => [table, 0]));
  const graph = new Map<string, string[]>();

  for (const table of tables) {
    graph.set(table, []);
  }

  for (const edge of edges) {
    if (!tableSet.has(edge.child_table) || !tableSet.has(edge.parent_table)) {
      continue;
    }

    graph.get(edge.parent_table)?.push(edge.child_table);
    inDegree.set(edge.child_table, (inDegree.get(edge.child_table) ?? 0) + 1);
  }

  const queue = tables.filter((table) => (inDegree.get(table) ?? 0) === 0).sort((a, b) => a.localeCompare(b));
  const ordered: string[] = [];

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) {
      break;
    }

    ordered.push(current);

    for (const next of graph.get(current) ?? []) {
      const nextDegree = (inDegree.get(next) ?? 0) - 1;
      inDegree.set(next, nextDegree);
      if (nextDegree === 0) {
        queue.push(next);
        queue.sort((a, b) => a.localeCompare(b));
      }
    }
  }

  const remaining = tables.filter((table) => !ordered.includes(table)).sort((a, b) => a.localeCompare(b));
  return { ordered, remaining };
}

async function getForeignKeyEdges(client: Client) {
  const result = await client.query<ForeignKeyEdge>(
    `
      select
        tc.table_name as child_table,
        ccu.table_name as parent_table
      from information_schema.table_constraints tc
      join information_schema.constraint_column_usage ccu
        on tc.constraint_name = ccu.constraint_name
       and tc.table_schema = ccu.table_schema
      where tc.constraint_type = 'FOREIGN KEY'
        and tc.table_schema = 'public'
      order by tc.table_name, ccu.table_name
    `
  );

  return result.rows;
}

async function getTableColumns(client: Client, table: string) {
  const result = await client.query<{ column_name: string }>(
    `
      select column_name
      from information_schema.columns
      where table_schema = 'public'
        and table_name = $1
      order by ordinal_position
    `,
    [table]
  );

  return result.rows.map((row) => row.column_name);
}

async function getPrimaryKeyColumns(client: Client, table: string) {
  const result = await client.query<{ column_name: string }>(
    `
      select kcu.column_name
      from information_schema.table_constraints tc
      join information_schema.key_column_usage kcu
        on tc.constraint_name = kcu.constraint_name
       and tc.table_schema = kcu.table_schema
      where tc.table_schema = 'public'
        and tc.table_name = $1
        and tc.constraint_type = 'PRIMARY KEY'
      order by kcu.ordinal_position
    `,
    [table]
  );

  return result.rows.map((row) => row.column_name);
}

async function getExistingTables(client: Client) {
  const result = await client.query<{ table_name: string }>(
    `
      select table_name
      from information_schema.tables
      where table_schema = 'public'
        and table_type = 'BASE TABLE'
      order by table_name
    `
  );

  return new Set(result.rows.map((row) => row.table_name));
}

async function resetOwnedSequences(client: Client, table: string) {
  const sequences = await client.query<SequenceRow>(
    `
      select
        table_name,
        column_name,
        pg_get_serial_sequence(format('%I.%I', table_schema, table_name), column_name) as sequence_name
      from information_schema.columns
      where table_schema = 'public'
        and table_name = $1
    `,
    [table]
  );

  for (const row of sequences.rows) {
    if (!row.sequence_name) {
      continue;
    }

    const tableIdentifier = `${quoteIdentifier("public")}.${quoteIdentifier(row.table_name)}`;
    const columnIdentifier = quoteIdentifier(row.column_name);
    await client.query(
      `
        select setval(
          $1,
          coalesce((select max(${columnIdentifier}) from ${tableIdentifier}), 0),
          coalesce((select max(${columnIdentifier}) from ${tableIdentifier}), null) is not null
        )
      `,
      [row.sequence_name]
    );
  }
}

async function setReplicationRole(client: Client, role: "origin" | "replica") {
  await client.query(`set session_replication_role = ${role}`);
}

async function truncateTables(client: Client, tables: string[]) {
  if (tables.length === 0) {
    return;
  }

  const tableList = tables
    .map((table) => `${quoteIdentifier("public")}.${quoteIdentifier(table)}`)
    .join(", ");

  await client.query(`truncate table ${tableList} restart identity cascade`);
}

async function importTable(client: Client, table: string, rows: unknown[], chunkRows: number) {
  if (rows.length === 0) {
    console.info(`SKIP ${table} empty`);
    return;
  }

  const columns = await getTableColumns(client, table);
  const primaryKeyColumns = await getPrimaryKeyColumns(client, table);
  if (columns.length === 0) {
    throw new Error(`No columns found for ${table}.`);
  }

  const dedupedRows =
    primaryKeyColumns.length === 0
      ? rows
      : Array.from(
          new Map(
            rows.map((row) => {
              const record = row as Record<string, unknown>;
              const key = JSON.stringify(primaryKeyColumns.map((column) => record[column] ?? null));
              return [key, row];
            })
          ).values()
        );

  if (dedupedRows.length !== rows.length) {
    console.warn(`DEDUPE ${table} removed=${rows.length - dedupedRows.length}`);
  }

  const columnList = columns.map((column) => quoteIdentifier(column)).join(", ");
  const tableType = `${quoteIdentifier("public")}.${quoteIdentifier(table)}`;
  const tableIdentifier = `${quoteIdentifier("public")}.${quoteIdentifier(table)}`;

  for (let offset = 0; offset < dedupedRows.length; offset += chunkRows) {
    const chunk = dedupedRows.slice(offset, offset + chunkRows);

    await client.query(
      `
        insert into ${tableIdentifier} (${columnList})
        select ${columnList}
        from json_populate_recordset(null::${tableType}, $1::json)
      `,
      [JSON.stringify(chunk)]
    );
  }

  await resetOwnedSequences(client, table);
  console.info(`IMPORT ${table} rows=${dedupedRows.length}`);
}

async function main() {
  const connectionString = getRequiredEnv("DATABASE_URL");
  const sslMode = getOptionalEnv("DATABASE_SSL_MODE") ?? undefined;
  const inputDir = getOptionalEnv("IMPORT_INPUT_DIR") ?? DEFAULT_INPUT_DIR;
  const chunkRows = Number(getOptionalEnv("IMPORT_CHUNK_ROWS") ?? DEFAULT_CHUNK_ROWS);
  const requestedTables = (getOptionalEnv("IMPORT_TABLES") ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  const client = new Client({
    connectionString,
    ssl: getSslConfig(sslMode)
  });

  await client.connect();

  try {
    const manifestPath = path.join(inputDir, "manifest.json");
    const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as ManifestFile;
    const existingTables = await getExistingTables(client);
    const availableTables = manifest.manifest
      .filter((entry) => entry.file)
      .map((entry) => entry.table)
      .filter((table) => {
        if (existingTables.has(table)) {
          return true;
        }

        console.warn(`Skipping ${table}: destination table does not exist.`);
        return false;
      });
    const selectedTables = requestedTables.length > 0 ? requestedTables.filter((table) => existingTables.has(table)) : availableTables;
    const edges = await getForeignKeyEdges(client);
    const { ordered, remaining } = computeImportOrder(selectedTables, edges);
    const orderedTables = [...ordered, ...remaining];

    if (remaining.length > 0) {
      console.warn(
        `Foreign key cycle detected for: ${remaining.join(", ")}. Importing the full snapshot with replication role set to replica.`
      );
    }

    try {
      await truncateTables(client, selectedTables);

      if (remaining.length > 0) {
        await setReplicationRole(client, "replica");
      }

      for (const table of orderedTables) {
        const entry = manifest.manifest.find((item) => item.table === table);
        if (!entry?.file) {
          console.info(`SKIP ${table} missing export file`);
          continue;
        }

        const rows = JSON.parse(await readFile(entry.file, "utf8")) as unknown[];
        await client.query("begin");

        try {
          await importTable(client, table, rows, chunkRows);
          await client.query("commit");
        } catch (error) {
          await client.query("rollback");
          throw new Error(
            `Failed importing ${table}: ${error instanceof Error ? error.message : String(error)}`
          );
        }
      }

      console.info(
        JSON.stringify(
          {
            importedTables: orderedTables.length,
            inputDir,
            orderedTables,
            status: "ok"
          },
          null,
          2
        )
      );
    } finally {
      if (remaining.length > 0) {
        await setReplicationRole(client, "origin");
      }
    }
  } finally {
    await client.end();
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
