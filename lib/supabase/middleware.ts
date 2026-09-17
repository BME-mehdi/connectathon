import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // Guard against missing or placeholder Supabase credentials in Edge runtime
  if (!supabaseUrl || !supabaseAnonKey || supabaseUrl.includes("placeholder")) {
    return supabaseResponse;
  }

  try {
    const supabase = createServerClient(
      supabaseUrl,
      supabaseAnonKey,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll();
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value }) =>
              request.cookies.set(name, value)
            );
            supabaseResponse = NextResponse.next({ request });
            cookiesToSet.forEach(({ name, value, options }) =>
              supabaseResponse.cookies.set(name, value, options)
            );
          },
        },
      }
    );

    // Refresh session on every request
    const { data: { user } } = await supabase.auth.getUser();

    // Protect page routes except auth pages and public assets. API routes are
    // deliberately excluded — they are also called by trusted server-to-server
    // callers (n8n) with no Supabase session cookie, and every route handler
    // already enforces its own auth (getUser()/role/secret checks). Redirecting
    // those requests to the login HTML page here would silently break them.
    const isAuthRoute = request.nextUrl.pathname.startsWith("/auth");
    const isApiRoute = request.nextUrl.pathname.startsWith("/api");
    const isPublicAsset =
      request.nextUrl.pathname.startsWith("/_next") ||
      request.nextUrl.pathname.startsWith("/favicon") ||
      request.nextUrl.pathname.match(/\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?)$/);

    if (!user && !isAuthRoute && !isApiRoute && !isPublicAsset) {
      const url = request.nextUrl.clone();
      url.pathname = "/auth/login";
      const redirectResponse = NextResponse.redirect(url);
      supabaseResponse.cookies.getAll().forEach((c) => {
        redirectResponse.cookies.set(c.name, c.value);
      });
      return redirectResponse;
    }
  } catch (err) {
    console.error("[middleware] Session refresh error:", err);
    return supabaseResponse;
  }

  return supabaseResponse;
}
