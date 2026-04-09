// Microsoft Outlook email client via Replit Connector (Microsoft Graph API)
// Integration: sharepoint==1.0.0 (reuses Microsoft OAuth)

async function getOutlookToken(): Promise<string> {
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY
    ? "repl " + process.env.REPL_IDENTITY
    : process.env.WEB_REPL_RENEWAL
    ? "depl " + process.env.WEB_REPL_RENEWAL
    : null;

  if (!hostname || !xReplitToken) {
    throw new Error("OUTLOOK_NOT_CONNECTED");
  }

  const response = await fetch(
    `https://${hostname}/api/v2/connection?include_secrets=true&connector_names=outlook`,
    {
      headers: {
        Accept: "application/json",
        X_REPLIT_TOKEN: xReplitToken,
      },
    }
  );

  if (!response.ok) {
    throw new Error("OUTLOOK_NOT_CONNECTED");
  }

  const data = await response.json();
  const connection = data.items?.[0];

  if (!connection || !connection.settings?.access_token) {
    throw new Error("OUTLOOK_NOT_CONNECTED");
  }

  return connection.settings.access_token;
}

export interface OutlookEmail {
  id: string;
  subject: string;
  sender: string;
  senderEmail: string;
  receivedAt: string;
  bodyPreview: string;
  hasAttachments: boolean;
}

export interface OutlookEmailDetail extends OutlookEmail {
  body: string;
}

export async function checkOutlookConnection(): Promise<boolean> {
  try {
    await getOutlookToken();
    return true;
  } catch {
    return false;
  }
}

export async function getRecentEmails(count: number = 20): Promise<OutlookEmail[]> {
  const token = await getOutlookToken();

  const url = new URL("https://graph.microsoft.com/v1.0/me/messages");
  url.searchParams.set("$top", String(count));
  url.searchParams.set("$select", "id,subject,sender,receivedDateTime,bodyPreview,hasAttachments");
  url.searchParams.set("$orderby", "receivedDateTime desc");

  const response = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    const error = await response.text();
    console.error("Graph API error fetching emails:", error);
    throw new Error("Failed to fetch emails from Outlook");
  }

  const data = await response.json();

  return (data.value || []).map((msg: any) => ({
    id: msg.id,
    subject: msg.subject || "(No Subject)",
    sender: msg.sender?.emailAddress?.name || msg.sender?.emailAddress?.address || "Unknown",
    senderEmail: msg.sender?.emailAddress?.address || "",
    receivedAt: msg.receivedDateTime,
    bodyPreview: msg.bodyPreview || "",
    hasAttachments: msg.hasAttachments || false,
  }));
}

export async function getEmailDetail(emailId: string): Promise<OutlookEmailDetail> {
  const token = await getOutlookToken();

  const url = `https://graph.microsoft.com/v1.0/me/messages/${encodeURIComponent(emailId)}`;

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    const error = await response.text();
    console.error("Graph API error fetching email detail:", error);
    throw new Error("Failed to fetch email from Outlook");
  }

  const msg = await response.json();

  // Extract plain text body from HTML if needed
  let body = msg.body?.content || msg.bodyPreview || "";
  if (msg.body?.contentType === "html") {
    // Strip HTML tags for AI processing
    body = body
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s{2,}/g, " ")
      .trim();
  }

  return {
    id: msg.id,
    subject: msg.subject || "(No Subject)",
    sender: msg.sender?.emailAddress?.name || msg.sender?.emailAddress?.address || "Unknown",
    senderEmail: msg.sender?.emailAddress?.address || "",
    receivedAt: msg.receivedDateTime,
    bodyPreview: msg.bodyPreview || "",
    hasAttachments: msg.hasAttachments || false,
    body,
  };
}
