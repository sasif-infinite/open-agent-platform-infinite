import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { generateJWTToken } from "@/lib/jwt-utils";

// This will contain the object which contains the access token
const MCP_TOKENS = process.env.MCP_TOKENS;
const MCP_SERVER_URL = process.env.NEXT_PUBLIC_MCP_SERVER_URL;
const MCP_AUTH_REQUIRED = process.env.NEXT_PUBLIC_MCP_AUTH_REQUIRED === "true";

async function getSupabaseUser(req: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return null;
  }

  try {
    // Create a Supabase client using the server client with cookies from the request
    const supabase = createServerClient(supabaseUrl, supabaseKey, {
      cookies: {
        get(name: string) {
          return req.cookies.get(name)?.value;
        },
        set() {}, // Not needed for token retrieval
        remove() {}, // Not needed for token retrieval
      },
    });

    // Get the session which contains the user
    const {
      data: { session },
    } = await supabase.auth.getSession();
    
    return session?.user || null;
  } catch (error) {
    console.error("Error getting Supabase user:", error);
    return null;
  }
}

/**
 * Proxies requests from the client to the MCP server.
 * Extracts the path after '/api/oap_mcp', constructs the target URL,
 * forwards the request with necessary headers and body, and injects
 * the MCP authorization token.
 *
 * @param req The incoming NextRequest.
 * @returns The response from the MCP server.
 */
export async function proxyRequest(req: NextRequest): Promise<Response> {
  if (!MCP_SERVER_URL) {
    return new Response(
      JSON.stringify({
        message:
          "MCP_SERVER_URL environment variable is not set. Please set it to the URL of your MCP server, or NEXT_PUBLIC_MCP_SERVER_URL if you do not want to use the proxy route.",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }

  // Extract the path after '/api/oap_mcp/'
  // Example: /api/oap_mcp/foo/bar -> /foo/bar
  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/api\/oap_mcp/, "");

  // Construct the target URL
  const targetUrlObj = new URL(MCP_SERVER_URL);
  targetUrlObj.pathname = `${targetUrlObj.pathname}${targetUrlObj.pathname.endsWith("/") ? "" : "/"}mcp${path}${url.search}`;
  const targetUrl = targetUrlObj.toString();

  // Prepare headers, forwarding original headers except Host
  // and adding Authorization
  const headers = new Headers();
  req.headers.forEach((value, key) => {
    // Some headers like 'host' should not be forwarded
    if (key.toLowerCase() !== "host") {
      headers.append(key, value);
    }
  });

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
      return new Response(
        JSON.stringify({
          message: "Failed to generate authentication token",
        }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      );
    }
  } else {
    // No user session found - return unauthorized
    return new Response(
      JSON.stringify({
        message: "Authentication required",
      }),
      { status: 401, headers: { "Content-Type": "application/json" } },
    );
  }

  headers.set("Accept", "application/json, text/event-stream");

  // Determine body based on method
  let body: BodyInit | null | undefined = undefined;
  if (req.method !== "GET" && req.method !== "HEAD") {
    // For POST, PUT, PATCH, DELETE etc., forward the body
    body = req.body;
  }

  try {
    // Make the proxied request
    const response = await fetch(targetUrl, {
      method: req.method,
      headers,
      body,
    });
    // Clone the response to create a new one we can modify
    const responseClone = response.clone();

    // Create a new response with the same status, headers, and body
    let newResponse: NextResponse;

    try {
      // Try to parse as JSON first
      const responseData = await responseClone.json();
      newResponse = NextResponse.json(responseData, {
        status: response.status,
        statusText: response.statusText,
      });
    } catch (_) {
      // If not JSON, use the raw response body
      const responseBody = await response.text();
      newResponse = new NextResponse(responseBody, {
        status: response.status,
        statusText: response.statusText,
      });
    }

    // Copy all headers from the original response
    response.headers.forEach((value, key) => {
      newResponse.headers.set(key, value);
    });

    return newResponse;
  } catch (error) {
    console.error("MCP Proxy Error:", error);
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ message: "Proxy request failed", error: errorMessage }),
      {
        status: 502, // Bad Gateway
        headers: { "Content-Type": "application/json" },
      },
    );
  }
}
