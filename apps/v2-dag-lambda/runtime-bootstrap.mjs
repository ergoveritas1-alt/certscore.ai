const runtimeApi = process.env.AWS_LAMBDA_RUNTIME_API;
const handlerSpec = process.argv[2] ?? process.env._HANDLER ?? "src/handler.handler";

if (!runtimeApi) {
  console.error("AWS_LAMBDA_RUNTIME_API is required.");
  process.exit(1);
}

const lastDotIndex = handlerSpec.lastIndexOf(".");
if (lastDotIndex <= 0 || lastDotIndex === handlerSpec.length - 1) {
  console.error(`Invalid Lambda handler spec: ${handlerSpec}`);
  process.exit(1);
}

const modulePath = `./${handlerSpec.slice(0, lastDotIndex)}.js`;
const exportName = handlerSpec.slice(lastDotIndex + 1);
const handlerModule = await import(modulePath);
const handler = handlerModule[exportName];

if (typeof handler !== "function") {
  console.error(`Lambda handler export not found: ${handlerSpec}`);
  process.exit(1);
}

async function postRuntimeResult(invocationId, suffix, payload) {
  await fetch(`http://${runtimeApi}/2018-06-01/runtime/invocation/${invocationId}/${suffix}`, {
    body: JSON.stringify(payload),
    headers: {
      "content-type": "application/json"
    },
    method: "POST"
  });
}

function serializeError(error) {
  return {
    errorMessage: error instanceof Error ? error.message : String(error),
    errorType: error instanceof Error ? error.name : "Error",
    stackTrace: error instanceof Error && error.stack ? error.stack.split("\n") : []
  };
}

while (true) {
  const nextResponse = await fetch(`http://${runtimeApi}/2018-06-01/runtime/invocation/next`);
  const invocationId = nextResponse.headers.get("lambda-runtime-aws-request-id");

  if (!invocationId) {
    console.error("Lambda runtime did not provide an invocation id.");
    process.exit(1);
  }

  try {
    const event = await nextResponse.json();
    const result = await handler(event, {
      awsRequestId: invocationId
    });
    await postRuntimeResult(invocationId, "response", result ?? null);
  } catch (error) {
    await postRuntimeResult(invocationId, "error", serializeError(error));
  }
}
