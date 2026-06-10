export function decodePubSubMessage(data: string): {
  emailAddress?: string;
  historyId?: string;
} {
  try {
    const decoded = Buffer.from(data, "base64").toString("utf-8");
    return JSON.parse(decoded) as { emailAddress?: string; historyId?: string };
  } catch {
    return {};
  }
}

export function verifyPubSubToken(authHeader: string | null): boolean {
  const secret = process.env.GOOGLE_PUBSUB_SECRET;
  if (!secret || !authHeader) return false;
  const token = authHeader.replace(/^Bearer\s+/i, "");
  return token === secret;
}
