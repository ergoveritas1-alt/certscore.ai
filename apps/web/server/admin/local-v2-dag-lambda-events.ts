export type AdminLocalV2DagLambdaEvent = {
  createdAt: string | null;
  eventType: string;
  message: string | null;
  metadataJson: Record<string, unknown> | null;
};

export function mapAdminLocalV2DagLambdaEvent(row: Record<string, unknown>): AdminLocalV2DagLambdaEvent {
  return {
    createdAt: typeof row.created_at === "string" ? row.created_at : null,
    eventType: String(row.event_type),
    message: typeof row.message === "string" ? row.message : null,
    metadataJson:
      row.metadata_json && typeof row.metadata_json === "object" && !Array.isArray(row.metadata_json)
        ? (row.metadata_json as Record<string, unknown>)
        : null
  };
}
