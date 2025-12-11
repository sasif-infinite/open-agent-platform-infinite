import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const API_BASE =
  process.env.LANGCONNECT_API_URL ?? process.env.NEXT_PUBLIC_RAG_API_URL;

function buildTargetUrl(req: NextRequest, path: string[] = []): URL {
  if (!API_BASE) {
    throw new Error("LANGCONNECT_API_URL is not configured");
  }

  const base = new URL(API_BASE);
  const normalizedBasePath = base.pathname.endsWith("/")
    ? base.pathname.slice(0, -1)
    : base.pathname;
  const normalizedPath = path.join("/");

  const url = new URL(base.toString());
  url.pathname = [normalizedBasePath, normalizedPath].filter(Boolean).join("/");
  url.search = new URL(req.url).search;

  return url;
}

async function handler(
  req: NextRequest,
  context: { params: { path?: string[] } },
): Promise<Response> {
  let targetUrl: URL;

  try {
    targetUrl = buildTargetUrl(req, context.params.path ?? []);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to build target URL";
    return NextResponse.json({ message }, { status: 500 });
  }

  const headers = new Headers(req.headers);
  headers.delete("host");

  const init: RequestInit = { method: req.method, headers };
  if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) {
    init.body = req.body;
  }

  try {
    const response = await fetch(targetUrl.toString(), init);
    const proxied = new NextResponse(response.body, {
      status: response.status,
      statusText: response.statusText,
    });

    response.headers.forEach((value, key) => {
      proxied.headers.set(key, value);
    });

    return proxied;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown proxy error";
    return NextResponse.json(
      { message: "LangConnect proxy request failed", error: message },
      { status: 502 },
    );
  }
}

export { handler as GET, handler as POST, handler as PUT, handler as PATCH };
export { handler as DELETE, handler as HEAD, handler as OPTIONS };
