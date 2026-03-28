import { NextResponse } from "next/server";
import { getValidationWebBotAuthDirectoryResponse } from "../../../lib/web-bot-auth";

export function GET(request: Request) {
  const directoryResponse = getValidationWebBotAuthDirectoryResponse(request.url);

  if (!directoryResponse) {
    return NextResponse.json(
      {
        error: "web_bot_auth_not_configured"
      },
      { status: 503 }
    );
  }

  const headers = new Headers({
    "Cache-Control": "public, max-age=60",
    "Content-Type": directoryResponse.contentType
  });
  headers.set("Signature", directoryResponse.headers.Signature ?? "");
  headers.set("Signature-Input", directoryResponse.headers["Signature-Input"] ?? "");

  return new NextResponse(directoryResponse.body, {
    headers,
    status: 200
  });
}
