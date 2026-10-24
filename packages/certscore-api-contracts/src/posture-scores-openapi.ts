export const postureScoresOpenApi = {
  type: "object", additionalProperties: false,
  description: "Two starting-page scoring postures from the same retained canonical findings. The legacy score field remains the EU-weighted score. A null California score means verified coverage cannot support a number; neither score is a compliance grade.",
  required: ["contractVersion", "gdprEprivacy", "ccpaCpra"],
  properties: {
    contractVersion: { type: "string", const: "certscore.posture-scores.v1" },
    gdprEprivacy: { type: "object", additionalProperties: false,
      required: ["posture", "score", "policyVersion", "coverage", "scope"],
      properties: { posture: { type: "string", const: "gdpr_eprivacy" }, score: { type: ["integer", "null"], minimum: 0, maximum: 100 },
        policyVersion: { type: ["string", "null"] }, coverage: { type: "string", enum: ["scored", "unavailable"] }, scope: { type: "string", const: "starting_page" } } },
    ccpaCpra: { type: "object", additionalProperties: false,
      required: ["posture", "score", "policyVersion", "coverage", "scope"],
      properties: { posture: { type: "string", const: "ccpa_cpra" }, score: { type: ["integer", "null"], minimum: 0, maximum: 100 },
        policyVersion: { type: "string", minLength: 1 },
        coverageSummary: {type:"object",additionalProperties:false,required:["postureBasis","evidenceFamilies","totalFamilies","scoreReady","families"],properties:{
          postureBasis:{type:"string",const:"assuming_ccpa_applies"},evidenceFamilies:{type:"integer",minimum:0,maximum:6},totalFamilies:{type:"integer",const:6},scoreReady:{type:"boolean"},
          families:{type:"array",minItems:6,maxItems:6,items:{type:"object",additionalProperties:false,required:["id","status"],properties:{id:{type:"string"},status:{type:"string",enum:["observed","assessed_gap","review","unknown","not_triggered_in_scope"]},
            assessmentState:{type:"string",enum:["completed","partial","limited"]},followUp:{type:"string",enum:["none","purpose","notice_association","recipient_roles","applicability","choice_execution","interpretation","capture"]}}}},
        }},
        coverage: { type: "string", enum: ["bounded", "limited", "unavailable"] }, scope: { type: "string", const: "starting_page" } } },
  },
} as const;


/** GPT Action schemas use enum rather than const while retaining exact values. */
export function postureScoresActionOpenApi(): Record<string, unknown> {
  const convert = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(convert);
    if (!value || typeof value !== "object") return value;
    return Object.fromEntries(Object.entries(value).map(([key, item]) => key === "const" ? ["enum", [item]] : [key, convert(item)]));
  };
  return convert(postureScoresOpenApi) as Record<string, unknown>;
}
