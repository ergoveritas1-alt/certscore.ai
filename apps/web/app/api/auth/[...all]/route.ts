import { toNextJsHandler } from "better-auth/next-js";
import { getAuth } from "../../../../server/better-auth/auth";

function getAuthRouteHandlers() {
  return toNextJsHandler(getAuth());
}

export async function DELETE(request: Request) {
  return getAuthRouteHandlers().DELETE(request);
}

export async function GET(request: Request) {
  return getAuthRouteHandlers().GET(request);
}

export async function PATCH(request: Request) {
  return getAuthRouteHandlers().PATCH(request);
}

export async function POST(request: Request) {
  return getAuthRouteHandlers().POST(request);
}

export async function PUT(request: Request) {
  return getAuthRouteHandlers().PUT(request);
}
