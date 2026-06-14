import { execFile } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

type TaskDescription = {
  containers?: Array<{ exitCode?: number; name?: string; reason?: string }>;
  lastStatus?: string;
  stoppedReason?: string;
  taskArn?: string;
};

type LaneCandidate = {
  completed_at: string | null;
  evidence: Record<string, unknown>;
  hostname: string;
  normalized_url: string;
  scan_id: string;
};

type CandidateReport = {
  generated_at: string;
  lanes: Record<string, LaneCandidate[]>;
  query_window_days: number;
};

const DEFAULT_CLUSTER = "certscore-validation-cluster";
const DEFAULT_SECURITY_GROUPS = ["sg-0503154fb5532cb04"];
const DEFAULT_SUBNETS = ["subnet-000adac289b27c3ac", "subnet-053d0eaa45152d300"];
const DEFAULT_TASK_DEFINITION = "certscore-prod-psql-oneoff:1";
const DEFAULT_CONTAINER_NAME = "psql";
const DEFAULT_LIMIT_PER_LANE = 12;
const DEFAULT_WINDOW_DAYS = 240;

function getArg(name: string) {
  const index = process.argv.indexOf(name);
  if (index === -1) return null;
  return process.argv[index + 1] ?? null;
}

function getEnv(name: string, fallback = "") {
  const value = process.env[name]?.trim();
  return value && value.length > 0 ? value : fallback;
}

function intArg(name: string, fallback: number) {
  const raw = getArg(name);
  if (!raw) return fallback;
  const value = Number.parseInt(raw, 10);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }
  return value;
}

function timestampSlug() {
  return new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function getTaskId(taskArn: string) {
  return taskArn.split("/").at(-1) ?? taskArn;
}

async function aws(args: string[]) {
  const { stdout } = await execFileAsync("aws", args, {
    maxBuffer: 30 * 1024 * 1024
  });
  return stdout;
}

function parseJson<T>(value: string): T {
  return JSON.parse(value) as T;
}

function extractJsonBetweenMarkers(logs: string) {
  const match = /__PROD_GOLD_CANDIDATES_JSON_START__\s*([\s\S]*?)\s*__PROD_GOLD_CANDIDATES_JSON_END__/m.exec(logs);
  if (!match?.[1]) {
    throw new Error("Could not locate prod candidate JSON in ECS task logs.");
  }
  return JSON.parse(match[1]) as CandidateReport;
}

function buildSql(input: { limitPerLane: number; windowDays: number }) {
  return `
with b as (
select s.id sid,s.completed_at ca,coalesce(nullif(d.normalized_url,''),'https://'||d.hostname) u,d.hostname h,
ss.cmp_vendor_name cmp,ss.cookie_banner_present cb,ss.accept_all_present ac,ss.reject_all_present rj,
ss.granular_preferences_present gp,ss.do_not_sell_link_present dns,ss.privacy_request_form_present prf,
ss.mentions_ccpa_or_cpra ccpa,ss.mentions_data_sale_or_sharing sale,ss.blocked_flag bl,ss.captcha_flag cap,
ss.homepage_fetch_status hfs,ss.homepage_fetch_http_status hhs,ss.auth_wall_detected aw,
ss.accessibility_statement_present a11y,ss.contact_form_present cf,ss.email_input_present ei,
ss.phone_input_present pi,ss.address_input_present ai,ss.payment_card_input_present pay,ss.date_of_birth_input_present dob,
ra.consent_opt_in_clicks cin,ra.consent_opt_out_clicks cout,ra.consent_blocker_type cbt,ra.consent_evidence_pass_count cep,
exists(select 1 from scan_signals x where x.scan_id=s.id and x.signal_key='privacy.do_not_sell_link_present' and x.signal_value_json='true'::jsonb) sdns,
exists(select 1 from scan_signals x where x.scan_id=s.id and (x.signal_key ilike '%tracking_after_refusal%' or x.signal_key ilike '%persist_after_reject%' or x.signal_key ilike '%reject_did_not_reduce%')) sprej,
exists(select 1 from scan_signals x where x.scan_id=s.id and (x.signal_key ilike '%privacy_request%' or x.signal_key ilike '%consumer_rights%' or x.signal_key ilike '%opt_out%')) spr
from scans s join domains d on d.id=s.domain_id
left join scan_snapshots ss on ss.scan_id=s.id
left join scan_runtime_artifacts ra on ra.scan_id=s.id
where s.status='completed' and s.completed_at>=timezone('utc',now())-(${input.windowDays}::text||' days')::interval
), l as (
select 'cmp_accept_reject' lane,* from b where bl is not true and cb is true and ac is true and rj is true and cmp is not null
union all select 'preference_center_cmp',* from b where bl is not true and gp is true and (cmp is not null or cb is true)
union all select 'privacy_opt_out_do_not_sell',* from b where bl is not true and (dns is true or prf is true or ccpa is true or sale is true or sdns is true or spr is true)
union all select 'post_reject_evidence_likely',* from b where bl is not true and (coalesce(cout,0)>0 or sprej is true or (rj is true and coalesce(cep,0)>0))
union all select 'no_go_or_non_representative',* from b where bl is true or cap is true or aw is true or hhs in (401,403,429) or hfs in ('forbidden','blocked','captcha','auth_wall') or cbt is not null
union all select 'form_collection_probe',* from b where bl is not true and (cf is true or ei is true or pi is true or ai is true or pay is true or dob is true)
union all select 'accessibility_probe',* from b where bl is not true and a11y is true
), d as (
select * from (select *,row_number() over(partition by lane,h order by ca desc nulls last) hr from l) q where hr=1
), lim as (
select * from (select *,row_number() over(partition by lane order by case when cmp is not null then 0 else 1 end,ca desc nulls last) lr from d) q where lr<=${input.limitPerLane}
)
select jsonb_build_object(
  'generated_at', timezone('utc', now()),
  'query_window_days', ${input.windowDays},
  'lanes', coalesce(jsonb_object_agg(lane, rows), '{}'::jsonb)
)
from (
  select
    lane,
    jsonb_agg(
      jsonb_build_object(
        'scan_id', sid::text,
        'hostname', h,
        'normalized_url', u,
        'completed_at', ca,
        'evidence', jsonb_strip_nulls(jsonb_build_object(
          'cmp', cmp,'cb', cb,'accept', ac,'reject', rj,'prefs', gp,'dns', dns,'privacy_form', prf,
          'ccpa', ccpa,'sale', sale,'blocked', bl,'captcha', cap,'fetch_status', hfs,'http', hhs,
          'auth_wall', aw,'opt_in_clicks', cin,'opt_out_clicks', cout,'blocker', cbt,'passes', cep,
          'signal_dns', sdns,'signal_post_reject', sprej,'signal_privacy_request', spr,
          'a11y_statement', a11y,'contact_form', cf,'email_input', ei,'phone_input', pi,'address_input', ai,'payment_input', pay,'dob_input', dob
        ))
      )
      order by ca desc nulls last
    ) as rows
  from lim
  group by lane
) lane_groups;
`.trim();
}

function toMarkdown(report: CandidateReport) {
  const lines = [
    "# Prod v2 Gold Corpus Candidate Discovery",
    "",
    `Generated: ${report.generated_at}`,
    `Query window: ${report.query_window_days} days`,
    "",
    "These are production-observed candidate URLs only. Re-scan them locally with v2 replay capture before treating any lane as covered.",
    ""
  ];

  for (const [lane, rows] of Object.entries(report.lanes).sort(([left], [right]) => left.localeCompare(right))) {
    lines.push(`## ${lane}`, "");
    if (rows.length === 0) {
      lines.push("_No candidates returned._", "");
      continue;
    }
    lines.push("| URL | Host | Scan | Evidence |");
    lines.push("| --- | --- | --- | --- |");
    for (const row of rows) {
      const evidence = Object.entries(row.evidence)
        .filter(([, value]) => value !== false && value !== null && value !== undefined && value !== "")
        .map(([key, value]) => `${key}=${String(value).replace(/\|/g, "\\|")}`)
        .slice(0, 8)
        .join("; ");
      lines.push(`| ${row.normalized_url} | ${row.hostname} | ${row.scan_id} | ${evidence || "n/a"} |`);
    }
    lines.push("");
  }

  lines.push("## URL Set", "");
  const urls = Array.from(new Set(Object.values(report.lanes).flatMap((rows) => rows.map((row) => row.hostname)))).sort();
  for (const url of urls) lines.push(url);
  lines.push("");
  return `${lines.join("\n")}\n`;
}

async function main() {
  const limitPerLane = intArg("--limit-per-lane", DEFAULT_LIMIT_PER_LANE);
  const windowDays = intArg("--window-days", DEFAULT_WINDOW_DAYS);
  const outDir = getArg("--out-dir") ?? path.join("artifacts", `prod-v2-gold-corpus-candidates-${timestampSlug()}`);
  const region = getEnv("AWS_REGION", "us-west-1");
  const cluster = getEnv("PROD_DB_CANDIDATES_ECS_CLUSTER", DEFAULT_CLUSTER);
  const taskDefinition = getEnv("PROD_DB_CANDIDATES_TASK_DEFINITION", DEFAULT_TASK_DEFINITION);
  const containerName = getEnv("PROD_DB_CANDIDATES_CONTAINER", DEFAULT_CONTAINER_NAME);
  const securityGroups = getEnv("PROD_DB_CANDIDATES_SECURITY_GROUPS", DEFAULT_SECURITY_GROUPS.join(",")).split(",").map((item) => item.trim()).filter(Boolean);
  const subnets = getEnv("PROD_DB_CANDIDATES_SUBNETS", DEFAULT_SUBNETS.join(",")).split(",").map((item) => item.trim()).filter(Boolean);

  mkdirSync(outDir, { recursive: true });
  const queryB64 = Buffer.from(buildSql({ limitPerLane, windowDays }), "utf8").toString("base64");
  const networkConfiguration = {
    awsvpcConfiguration: {
      assignPublicIp: "ENABLED",
      securityGroups,
      subnets
    }
  };
  const command = [
    "set -eu; test \"${PGSSLMODE:-}\" = require; printf %s \"$QUERY_B64\" | base64 -d > /tmp/query.sql; echo __PROD_GOLD_CANDIDATES_JSON_START__; psql -X --no-password -v ON_ERROR_STOP=1 -P pager=off -P footer=off -t -A \"$DATABASE_URL\" -f /tmp/query.sql; echo __PROD_GOLD_CANDIDATES_JSON_END__"
  ];
  const overrides = {
    containerOverrides: [
      {
        command,
        environment: [{ name: "QUERY_B64", value: queryB64 }],
        name: containerName
      }
    ]
  };

  const runTaskPayload = parseJson<{ failures?: unknown[]; tasks?: Array<{ taskArn?: string }> }>(
    await aws([
      "ecs",
      "run-task",
      "--region",
      region,
      "--cluster",
      cluster,
      "--task-definition",
      taskDefinition,
      "--launch-type",
      "FARGATE",
      "--network-configuration",
      JSON.stringify(networkConfiguration),
      "--overrides",
      JSON.stringify(overrides),
      "--output",
      "json"
    ])
  );
  if (runTaskPayload.failures?.length) {
    throw new Error(`ECS prod candidate DB task failed to start: ${JSON.stringify(runTaskPayload.failures)}`);
  }
  const taskArn = runTaskPayload.tasks?.[0]?.taskArn;
  if (!taskArn) {
    throw new Error("ECS prod candidate DB task did not return a task ARN.");
  }
  writeFileSync(path.join(outDir, "task-arn.txt"), `${taskArn}\n`);

  await aws(["ecs", "wait", "tasks-stopped", "--region", region, "--cluster", cluster, "--tasks", taskArn]);
  const taskPayload = parseJson<{ tasks?: TaskDescription[] }>(
    await aws(["ecs", "describe-tasks", "--region", region, "--cluster", cluster, "--tasks", taskArn, "--output", "json"])
  );
  writeFileSync(path.join(outDir, "task.json"), `${JSON.stringify(taskPayload, null, 2)}\n`);

  const task = taskPayload.tasks?.[0];
  const taskContainer = task?.containers?.find((candidate) => candidate.name === containerName) ?? task?.containers?.[0];
  const exitCode = taskContainer?.exitCode ?? 1;
  const taskDefinitionPayload = parseJson<{
    taskDefinition?: {
      containerDefinitions?: Array<{
        logConfiguration?: { options?: Record<string, string> };
        name?: string;
      }>;
    };
  }>(await aws(["ecs", "describe-task-definition", "--region", region, "--task-definition", taskDefinition, "--output", "json"]));
  const logOptions =
    taskDefinitionPayload.taskDefinition?.containerDefinitions?.find((container) => container.name === containerName)?.logConfiguration?.options ??
    {};
  const logGroup = logOptions["awslogs-group"];
  const logPrefix = logOptions["awslogs-stream-prefix"];
  if (!logGroup || !logPrefix) {
    throw new Error("Could not resolve psql one-off task log configuration.");
  }

  const streamName = `${logPrefix}/${containerName}/${getTaskId(taskArn)}`;
  const logsPayload = parseJson<{ events?: Array<{ message?: string }> }>(
    await aws([
      "logs",
      "get-log-events",
      "--region",
      region,
      "--log-group-name",
      logGroup,
      "--log-stream-name",
      streamName,
      "--start-from-head",
      "--output",
      "json"
    ])
  );
  const logMessages = logsPayload.events?.map((event) => event.message).filter((message): message is string => Boolean(message)) ?? [];
  writeFileSync(path.join(outDir, "logs.json"), `${JSON.stringify({ taskArn, logGroup, streamName, messages: logMessages }, null, 2)}\n`);

  if (exitCode !== 0) {
    throw new Error(`ECS psql one-off exited ${exitCode}. See ${path.join(outDir, "logs.json")}`);
  }

  const report = extractJsonBetweenMarkers(logMessages.join("\n"));
  const jsonPath = path.join(outDir, "ProdGoldCorpusCandidates.json");
  const markdownPath = path.join(outDir, "ProdGoldCorpusCandidates.md");
  const urlsPath = path.join(outDir, "candidate-hosts.txt");
  const urls = Array.from(new Set(Object.values(report.lanes).flatMap((rows) => rows.map((row) => row.hostname)))).sort();
  writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`);
  writeFileSync(markdownPath, toMarkdown(report));
  writeFileSync(urlsPath, `${urls.join("\n")}\n`);

  console.log(JSON.stringify({ jsonPath, laneCount: Object.keys(report.lanes).length, markdownPath, outDir, urlCount: urls.length, urlsPath }, null, 2));
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
