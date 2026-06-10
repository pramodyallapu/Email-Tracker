import { auth } from "@/lib/auth";
import { Button } from "@/components/ui/Button";
import { signIn } from "@/lib/auth";
import Link from "next/link";
import { redirect } from "next/navigation";

export default async function HomePage() {
  const session = await auth();
  const zohoEnabled = Boolean(process.env.ZOHO_CLIENT_ID);

  if (session) {
    redirect("/dashboard");
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-blue-50 to-white px-4">
      <div className="max-w-lg text-center">
        <h1 className="text-4xl font-bold tracking-tight text-gray-900">
          Email Tracker
        </h1>
        <p className="mt-4 text-lg text-gray-600">
          Sync Gmail and Zoho Mail metadata, measure reply times, and monitor
          SLA performance — without storing email bodies.
        </p>
        <div className="mt-8 space-y-3">
          <form
            action={async () => {
              "use server";
              await signIn("google", { redirectTo: "/dashboard" });
            }}
          >
            <Button type="submit" size="lg" className="w-full">
              Sign in with Google
            </Button>
          </form>
          {zohoEnabled && (
            <form
              action={async () => {
                "use server";
                await signIn("zoho", { redirectTo: "/dashboard" });
              }}
            >
              <Button type="submit" size="lg" variant="secondary" className="w-full">
                Sign in with Zoho Mail
              </Button>
            </form>
          )}
        </div>
        <p className="mt-6 text-sm text-gray-500">
          <Link href="/auth/signin" className="text-blue-600 hover:underline">
            Alternative sign-in page
          </Link>
        </p>
      </div>
    </main>
  );
}
