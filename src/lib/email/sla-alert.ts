export async function sendSlaAlertEmail(
  to: string,
  threadSubject: string,
  hoursWaiting: number
): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.log(
      `SLA alert (no Resend): ${to} — "${threadSubject}" waiting ${hoursWaiting}h`
    );
    return false;
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: process.env.RESEND_FROM_EMAIL ?? "alerts@resend.dev",
      to,
      subject: `SLA breach: ${threadSubject}`,
      html: `
        <h2>SLA breach alert</h2>
        <p>Thread <strong>${threadSubject}</strong> has been waiting <strong>${hoursWaiting} hours</strong> without a reply.</p>
        <p><a href="${process.env.NEXTAUTH_URL}/dashboard/inbox">View in Email Tracker</a></p>
      `,
    }),
  });

  return response.ok;
}
