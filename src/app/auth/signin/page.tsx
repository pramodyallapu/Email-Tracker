import { auth, signIn } from "@/lib/auth";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { redirect } from "next/navigation";

const errorMessages: Record<string, string> = {
  RefreshAccessTokenError:
    "Your mail session expired. Please sign in again.",
  OAuthSignin: "Could not start sign-in. Try again.",
  AccessDenied:
    "Sign-in was denied. Run sql/mail-connections.sql in Supabase, confirm ZOHO_DC=in in .env.local, and try again.",
  default: "An error occurred during sign-in.",
};

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; callbackUrl?: string }>;
}) {
  const session = await auth();
  const params = await searchParams;
  const zohoEnabled = Boolean(process.env.ZOHO_CLIENT_ID);

  if (session?.user?.id && !session.error) {
    redirect(params.callbackUrl ?? "/dashboard");
  }

  const errorKey = params.error ?? "";
  const errorMessage =
    errorMessages[errorKey] ?? (errorKey ? errorMessages.default : null);

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-900 px-4">
      <Card className="w-full max-w-md border-0 shadow-xl">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-500 text-xl font-bold text-white">
            ET
          </div>
          <CardTitle className="text-2xl">Email Tracker</CardTitle>
          <p className="text-sm text-gray-500">
            Track Gmail and Zoho reply times
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          {errorMessage && (
            <div
              className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
              role="alert"
            >
              {errorMessage}
            </div>
          )}
          {session && !session.user?.id && !session.error && (
            <div
              className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
              role="alert"
            >
              Run <code className="text-xs">sql/schema-core.sql</code> and{" "}
              <code className="text-xs">sql/mail-connections.sql</code> in
              Supabase, then sign in again.
            </div>
          )}
          <form
            action={async () => {
              "use server";
              await signIn("google", {
                redirectTo: params.callbackUrl ?? "/dashboard",
              });
            }}
          >
            <Button type="submit" className="w-full" size="lg">
              Continue with Google
            </Button>
          </form>
          {zohoEnabled && (
            <form
              action={async () => {
                "use server";
                await signIn("zoho", {
                  redirectTo: params.callbackUrl ?? "/dashboard",
                });
              }}
            >
              <Button type="submit" className="w-full" size="lg" variant="secondary">
                Continue with Zoho Mail
              </Button>
            </form>
          )}
          <p className="text-center text-xs text-gray-500">
            Sign in with one provider, then connect the other in Settings.
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
