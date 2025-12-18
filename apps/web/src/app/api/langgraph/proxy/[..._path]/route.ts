import { validate } from "uuid";
import { initApiPassthrough } from "langgraph-nextjs-api-passthrough";
import { NextRequest } from "next/server";
import { getDeployments } from "@/lib/environment/deployments";
import { createServerClient } from "@supabase/ssr";
import { generateJWTToken } from "@/lib/jwt-utils";

/**
 * The 'langgraph-nextjs-api-passthrough' package is used to implement a proxy
 * between your client, and LangGraph deployment to not expose your LangGraph
 * API key to the client. It's implemented in a way which assumes you only will
 * need to connect to a single LangGraph deployment per app. Since this app
 * allows connecting to multiple different deployments, we need to setup a custom
 * solution which can use this passthrough with dynamic deployment URLs.
 *
 * The solution to this is to wrap the dynamic API route (`/[..._path]/route.ts`)
 * with another dynamic path field (`/[...deploymentId]/[..._path]/route.ts`). The
 * deployment ID will then be used to find the corresponding deployment URL, and
 * pass that to the `initApiPassthrough` function. We must also pass the updated
 * base route to `initApiPassthrough`, which consists of `langgraph/proxy/${deploymentId}`.
 */

export const runtime = "edge";

/**
 * The dynamic route parameters for this API endpoint.
 */
type DynamicRouteParams = {
  _path: string[];
};

/**
 * The request parameters for this API endpoint.
 * This is the second argument of the API route handler functions.
 */
type RequestParams = {
  params: Promise<DynamicRouteParams>;
};

/**
 * Determines if the LangGraph proxy route is enabled based on environment configuration.
 *
 * This function acts as a security gate for all proxy endpoints, preventing unauthorized
 * access to the LangGraph server via admin authentication (API key). The proxy
 * functionality is only available when explicitly enabled through the
 * NEXT_PUBLIC_USE_LANGSMITH_AUTH environment variable.
 *
 * @returns {boolean} True if proxy routes should be accessible (NEXT_PUBLIC_USE_LANGSMITH_AUTH === "true"),
 *                   false otherwise.
 */
function isProxyRouteEnabled() {
  return process.env.NEXT_PUBLIC_USE_LANGSMITH_AUTH === "true";
}

/**
 * Get Supabase user from the request
 */
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

/**
 * Generate JWT token and add to request headers
 */
async function addJWTAuthHeader(req: NextRequest): Promise<Headers | null> {
  const user = await getSupabaseUser(req);
  
  if (!user) {
    return null;
  }

  try {
    const jwtToken = await generateJWTToken(
      user.id,
      user.email || "unknown@example.com",
      {
        name: user.user_metadata?.name || user.email,
      }
    );
    
    const headers = new Headers(req.headers);
    headers.set("Authorization", `Bearer ${jwtToken}`);
    return headers;
  } catch (error) {
    console.error("Error generating JWT token:", error);
    return null;
  }
}

/**
 * Finds the deployment URL based on the path parameters. If the first item in the
 * _path array is not a valid UUID, or if the deployment is not found, returns null.
 * @param params The request parameters containing the path segments.
 * @param params._path The path segments in the request URL.
 * @returns An object with the base route and deployment URL, or null if not found.
 */
async function getDeploymentUrl({
  params,
}: RequestParams): Promise<{ baseRoute: string; url: string } | null> {
  const { _path } = await params;
  // The first item in the _path array should always be the deployment ID.
  const deploymentId = _path[0];
  if (!validate(deploymentId)) {
    return null;
  }
  const deployment = getDeployments().find((d) => d.id === deploymentId);

  if (deployment) {
    return {
      baseRoute: `langgraph/proxy/${deploymentId}`,
      url: deployment.deploymentUrl,
    };
  }
  return null;
}

export async function GET(req: NextRequest, { params }: RequestParams) {
  const urlAndRoute = await getDeploymentUrl({ params });
  if (!urlAndRoute) {
    return new Response("Deployment not found", { status: 404 });
  }

  if (!isProxyRouteEnabled()) {
    return new Response("Proxy route not enabled", { status: 403 });
  }

  // Add JWT authentication header
  const authHeaders = await addJWTAuthHeader(req);
  if (!authHeaders) {
    return new Response("Authentication required", { status: 401 });
  }

  // Create new request with JWT token
  const authedReq = new NextRequest(req.url, {
    method: req.method,
    headers: authHeaders,
    body: req.body,
  });

  const { GET } = initApiPassthrough({
    apiKey: process.env.LANGSMITH_API_KEY,
    apiUrl: urlAndRoute.url,
    baseRoute: urlAndRoute.baseRoute,
    disableWarningLog: true,
  });

  return GET(authedReq);
}

export async function POST(req: NextRequest, { params }: RequestParams) {
  const urlAndRoute = await getDeploymentUrl({ params });
  if (!urlAndRoute) {
    return new Response("Deployment not found", { status: 404 });
  }

  if (!isProxyRouteEnabled()) {
    return new Response("Proxy route not enabled", { status: 403 });
  }

  // Add JWT authentication header
  const authHeaders = await addJWTAuthHeader(req);
  if (!authHeaders) {
    return new Response("Authentication required", { status: 401 });
  }

  // Create new request with JWT token
  const authedReq = new NextRequest(req.url, {
    method: req.method,
    headers: authHeaders,
    body: req.body,
  });

  const { POST } = initApiPassthrough({
    apiKey: process.env.LANGSMITH_API_KEY,
    apiUrl: urlAndRoute.url,
    baseRoute: urlAndRoute.baseRoute,
    disableWarningLog: true,
  });

  return POST(authedReq);
}

export async function PUT(req: NextRequest, { params }: RequestParams) {
  const urlAndRoute = await getDeploymentUrl({ params });
  if (!urlAndRoute) {
    return new Response("Deployment not found", { status: 404 });
  }

  if (!isProxyRouteEnabled()) {
    return new Response("Proxy route not enabled", { status: 403 });
  }

  // Add JWT authentication header
  const authHeaders = await addJWTAuthHeader(req);
  if (!authHeaders) {
    return new Response("Authentication required", { status: 401 });
  }

  // Create new request with JWT token
  const authedReq = new NextRequest(req.url, {
    method: req.method,
    headers: authHeaders,
    body: req.body,
  });

  const { PUT } = initApiPassthrough({
    apiKey: process.env.LANGSMITH_API_KEY,
    apiUrl: urlAndRoute.url,
    baseRoute: urlAndRoute.baseRoute,
    disableWarningLog: true,
  });

  return PUT(authedReq);
}

export async function PATCH(req: NextRequest, { params }: RequestParams) {
  const urlAndRoute = await getDeploymentUrl({ params });
  if (!urlAndRoute) {
    return new Response("Deployment not found", { status: 404 });
  }

  if (!isProxyRouteEnabled()) {
    return new Response("Proxy route not enabled", { status: 403 });
  }

  // Add JWT authentication header
  const authHeaders = await addJWTAuthHeader(req);
  if (!authHeaders) {
    return new Response("Authentication required", { status: 401 });
  }

  // Create new request with JWT token
  const authedReq = new NextRequest(req.url, {
    method: req.method,
    headers: authHeaders,
    body: req.body,
  });

  const { PATCH } = initApiPassthrough({
    apiKey: process.env.LANGSMITH_API_KEY,
    apiUrl: urlAndRoute.url,
    baseRoute: urlAndRoute.baseRoute,
    disableWarningLog: true,
  });

  return PATCH(authedReq);
}

export async function DELETE(req: NextRequest, { params }: RequestParams) {
  const urlAndRoute = await getDeploymentUrl({ params });
  if (!urlAndRoute) {
    return new Response("Deployment not found", { status: 404 });
  }

  if (!isProxyRouteEnabled()) {
    return new Response("Proxy route not enabled", { status: 403 });
  }

  // Add JWT authentication header
  const authHeaders = await addJWTAuthHeader(req);
  if (!authHeaders) {
    return new Response("Authentication required", { status: 401 });
  }

  // Create new request with JWT token
  const authedReq = new NextRequest(req.url, {
    method: req.method,
    headers: authHeaders,
    body: req.body,
  });

  const { DELETE } = initApiPassthrough({
    apiKey: process.env.LANGSMITH_API_KEY,
    apiUrl: urlAndRoute.url,
    baseRoute: urlAndRoute.baseRoute,
    disableWarningLog: true,
  });

  return DELETE(authedReq);
}
