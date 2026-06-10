import { decodePubSubMessage, verifyPubSubToken } from "@/lib/gmail/pubsub";
import { incrementalSync } from "@/lib/gmail/incremental";
import { getMailConnectionByMailbox } from "@/lib/mail/connections";
import type { MailScope } from "@/lib/mail/scope";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");
    if (
      process.env.NODE_ENV === "production" &&
      !verifyPubSubToken(authHeader)
    ) {
      return NextResponse.json({ received: true });
    }

    const body = (await request.json()) as {
      message?: { data?: string };
    };

    const data = body.message?.data;
    if (!data) {
      return NextResponse.json({ received: true });
    }

    const notification = decodePubSubMessage(data);
    if (!notification.emailAddress) {
      return NextResponse.json({ received: true });
    }

    const connection = await getMailConnectionByMailbox(
      notification.emailAddress
    );

    if (connection?.organization_id) {
      const scope: MailScope = {
        mode: "organization",
        organizationId: connection.organization_id,
        userId: connection.connected_by_user_id ?? "",
      };
      void incrementalSync(scope, connection).catch((err) =>
        console.error("Webhook incremental sync failed:", err)
      );
    } else if (connection?.user_id) {
      const scope: MailScope = {
        mode: "personal",
        userId: connection.user_id,
      };
      void incrementalSync(scope, connection).catch((err) =>
        console.error("Webhook incremental sync failed:", err)
      );
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("Gmail webhook error:", error);
    return NextResponse.json({ received: true });
  }
}
