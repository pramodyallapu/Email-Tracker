import "next-auth";
import type { OrgRole } from "@/lib/org/types";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      email: string;
      name?: string | null;
      image?: string | null;
    };
    accessToken?: string;
    error?: string;
    provider?: "google" | "zoho";
    organizationId?: string;
    organizationName?: string;
    orgRole?: OrgRole;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    userId?: string;
    email?: string;
    provider?: "google" | "zoho";
    accessToken?: string;
    refreshToken?: string;
    accessTokenExpires?: number;
    error?: string;
    organizationId?: string;
    organizationName?: string;
    orgRole?: OrgRole;
  }
}
