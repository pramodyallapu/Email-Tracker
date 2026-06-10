/** App base URL for invite links — prefers the incoming request host/port. */
export function getAppBaseUrl(request?: Request): string {
  if (request) {
    const host =
      request.headers.get("x-forwarded-host") ??
      request.headers.get("host");
    if (host) {
      const proto =
        request.headers.get("x-forwarded-proto") ??
        (host.includes("localhost") ? "http" : "https");
      return `${proto}://${host}`;
    }
  }

  return process.env.NEXTAUTH_URL ?? "http://localhost:3000";
}
