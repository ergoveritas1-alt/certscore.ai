import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const DEFAULT_OUTPUT_DIR = path.resolve(process.cwd(), "tmp/supabase-export");
const DEFAULT_PAGE_SIZE = 1000;

type OpenApiDocument = {
  paths?: Record<string, unknown>;
};

type TableManifest = {
  count: number | null;
  exportedRows?: number;
  file?: string;
  table: string;
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

function buildHeaders() {
  const apiKey = getRequiredEnv("SUPABASE_SERVICE_ROLE_KEY");
  return {
    apikey: apiKey,
    Authorization: `Bearer ${apiKey}`
  };
}

async function fetchJson<T>(url: string, init: RequestInit = {}) {
  const response = await fetch(url, init);
  if (!response.ok) {
    throw new Error(`Request failed for ${url}: ${response.status} ${response.statusText}`);
  }

  return (await response.json()) as T;
}

function getRestUrl(pathname: string) {
  const baseUrl = getRequiredEnv("SUPABASE_URL").replace(/\/+$/, "");
  return `${baseUrl}/rest/v1${pathname}`;
}

function getOpenApiTableNames(document: OpenApiDocument) {
  const paths = Object.keys(document.paths ?? {});
  return paths
    .filter((pathname) => pathname !== "/" && !pathname.startsWith("/rpc/"))
    .map((pathname) => pathname.replace(/^\/+/, "").split("/")[0] ?? "")
    .filter(Boolean)
    .filter((value, index, values) => values.indexOf(value) === index)
    .sort((left, right) => left.localeCompare(right));
}

async function fetchTableCount(table: string) {
  const response = await fetch(`${getRestUrl(`/${table}`)}?select=*&limit=1`, {
    headers: {
      ...buildHeaders(),
      Prefer: "count=exact"
    }
  });

  if (!response.ok) {
    throw new Error(`Count failed for ${table}: ${response.status} ${response.statusText}`);
  }

  const contentRange = response.headers.get("content-range");
  if (!contentRange) {
    return null;
  }

  const total = contentRange.split("/")[1];
  return total && total !== "*" ? Number(total) : null;
}

async function exportTable(table: string, outputDir: string, pageSize: number) {
  const orderColumn = getOptionalEnv("SUPABASE_EXPORT_ORDER_COLUMN");
  const orderDirection = (getOptionalEnv("SUPABASE_EXPORT_ORDER_DIRECTION") ?? "asc").toLowerCase();
  const rows: unknown[] = [];
  let offset = 0;

  for (;;) {
    const searchParams = new URLSearchParams({
      limit: String(pageSize),
      offset: String(offset),
      select: "*"
    });

    if (orderColumn) {
      searchParams.set("order", `${orderColumn}.${orderDirection}`);
    }

    const url = `${getRestUrl(`/${table}`)}?${searchParams.toString()}`;
    const page = await fetchJson<unknown[]>(url, {
      headers: buildHeaders()
    });

    rows.push(...page);

    if (page.length < pageSize) {
      break;
    }

    offset += pageSize;
  }

  const outputPath = path.join(outputDir, `${table}.json`);
  await writeFile(outputPath, JSON.stringify(rows, null, 2));

  return {
    file: outputPath,
    rows: rows.length
  };
}

async function main() {
  const outputDir = getOptionalEnv("SUPABASE_EXPORT_OUTPUT_DIR") ?? DEFAULT_OUTPUT_DIR;
  const exportMode = (getOptionalEnv("SUPABASE_EXPORT_MODE") ?? "inventory").toLowerCase();
  const pageSize = Number(getOptionalEnv("SUPABASE_EXPORT_PAGE_SIZE") ?? DEFAULT_PAGE_SIZE);
  const requestedTables = (getOptionalEnv("SUPABASE_EXPORT_TABLES") ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  await mkdir(outputDir, { recursive: true });

  const document = await fetchJson<OpenApiDocument>(getRestUrl("/"), {
    headers: buildHeaders()
  });
  const discoveredTables = getOpenApiTableNames(document);
  const tables = requestedTables.length > 0 ? requestedTables : discoveredTables;

  const manifest: TableManifest[] = [];

  for (const table of tables) {
    const count = await fetchTableCount(table);
    const manifestEntry: TableManifest = {
      count,
      table
    };

    if (exportMode === "export") {
      const exportResult = await exportTable(table, outputDir, pageSize);
      manifestEntry.exportedRows = exportResult.rows;
      manifestEntry.file = exportResult.file;
    }

    console.info(
      JSON.stringify(
        {
          count,
          exported: manifestEntry.exportedRows ?? null,
          table
        },
        null,
        2
      )
    );

    manifest.push(manifestEntry);
  }

  const manifestPath = path.join(outputDir, "manifest.json");
  await writeFile(
    manifestPath,
    JSON.stringify(
      {
        exportMode,
        manifest,
        outputDir,
        pageSize
      },
      null,
      2
    )
  );

  console.info(`Wrote manifest to ${manifestPath}`);
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
