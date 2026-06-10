import type { NextAuthConfig } from "next-auth";

/**
 * Edge-safe auth config for middleware only.
 * Do not import Node.js modules (Supabase, etc.) in this file.
 */
export const authConfig = {
  pages: {
    signIn: "/auth/signin",
  },
  providers: [],
  callbacks: {
    authorized({ auth, request }) {
      const isDashboard = request.nextUrl.pathname.startsWith("/dashboard");
      if (!isDashboard) return true;
      return !!auth?.user;
    },
  },
} satisfies NextAuthConfig;
