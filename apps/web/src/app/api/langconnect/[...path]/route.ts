import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { generateJWTToken } from "@/lib/jwt-utils";

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

async function getSupabaseUser(req: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return null;
  }

  try {
    const supabase = createServerClient(supabaseUrl, supabaseKey, {
      cookies: {
        get(name: string) {
          return req.cookies.get(name)?.value;
        },
        set() {},
        remove() {},
      },
    });

    const {
      data: { session },
    } = await supabase.auth.getSession();
    
    return session?.user || null;
  } catch (error) {
    console.error("Error getting Supabase user:", error);
    return null;
  }
}

async function handler(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
): Promise<Response> {
  let targetUrl: URL;

  try {
    const { path } = await params;
    targetUrl = buildTargetUrl(req, path ?? []);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to build target URL";
    return NextResponse.json({ message }, { status: 500 });
  }

  const headers = new Headers(req.headers);
  headers.delete("host");

  // Get user from Supabase session and generate JWT token
  const user = await getSupabaseUser(req);
  if (user) {
    try {
      const jwtToken = await generateJWTToken(
        user.id,
        user.email || "unknown@example.com",
        {
          name: user.user_metadata?.name || user.email,
        }
      );
      
      // Add JWT token to Authorization header
      headers.set("Authorization", `Bearer ${jwtToken}`);
    } catch (error) {
      console.error("Error generating JWT token:", error);
      return NextResponse.json(
        { message: "Failed to generate authentication token" },
        { status: 500 }
      );
    }
  } else {
    // No user session found
    return NextResponse.json(
      { message: "Authentication required" },
      { status: 401 }
    );
  }

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

export function GET(
  req: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  return handler(req, context);
}
export function POST(
  req: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  return handler(req, context);
}
export function PUT(
  req: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  return handler(req, context);
}
export function PATCH(
  req: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  return handler(req, context);
}
export function DELETE(
  req: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  return handler(req, context);
}
export function HEAD(
  req: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  return handler(req, context);
}
export function OPTIONS(
  req: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  return handler(req, context);
}
