import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase-server";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";

  if (code) {
    const supabase = createSupabaseServer();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      // Upsert user profile — safe to call for both OAuth and email flows.
      // The DB trigger handles the initial insert; this covers data freshness on OAuth re-login.
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        await supabase.from("user_profiles").upsert(
          {
            id: user.id,
            display_name: user.email?.split("@")[0] ?? "User",
            username:
              (user.email?.split("@")[0] ?? "user") +
              "_" +
              user.id.slice(0, 6),
          },
          { onConflict: "id", ignoreDuplicates: true }
        );
      }

      // next is user-supplied — only allow relative paths to prevent open redirect
      const safeNext = next.startsWith("/") ? next : "/";
      return NextResponse.redirect(`${origin}${safeNext}`);
    }
  }

  return NextResponse.redirect(`${origin}/auth/login?error=auth_error`);
}
