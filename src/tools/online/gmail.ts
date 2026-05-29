import { google } from "googleapis";
import { getGmailCreds, saveCredentials } from "../../credentials.js";
import { SENDER_NAME } from "../../config.js";
import type { ChatSessionModelFunctions } from "node-llama-cpp";

function getClient(): ReturnType<typeof google.gmail> {
  const creds = getGmailCreds();

  const auth = new google.auth.OAuth2(creds.clientId, creds.clientSecret);
  auth.setCredentials({
    access_token: creds.accessToken,
    refresh_token: creds.refreshToken,
    expiry_date: creds.expiryDate,
  });

  auth.on("tokens", (tokens) => {
    if (tokens.access_token) {
      saveCredentials({
        gmail: {
          ...creds,
          accessToken: tokens.access_token,
          expiryDate: tokens.expiry_date ?? creds.expiryDate,
        },
      });
    }
  });

  return google.gmail({ version: "v1", auth });
}

const GREETING_PATTERNS = /^(hi|hello|dear|bonjour|salut)[,\s]/i;
const CLOSING_PATTERNS = /kind regards|best regards|cordialement|sincèrement/i;

function recipientFirstName(to: string): string {
  const local = to.split("@")[0];
  const cleaned = local.replace(/\d+/g, "");
  const first = cleaned.split(/[.\-_]+/)[0];
  return first.charAt(0).toUpperCase() + first.slice(1);
}

function senderName(): string {
  try {
    return getGmailCreds().displayName || SENDER_NAME;
  } catch {
    return SENDER_NAME;
  }
}

function reflowParagraphs(text: string): string {
  return text
    .split(/\n{2,}/)
    .map((para) => para.split("\n").join(" ").replace(/\s+/g, " ").trim())
    .join("\n\n");
}

function formatBody(body: string, to: string): string {
  let result = reflowParagraphs(body.trim());

  if (!GREETING_PATTERNS.test(result)) {
    result = `Hi ${recipientFirstName(to)},\n\n${result}`;
  }

  if (CLOSING_PATTERNS.test(result)) {
    result = result.replace(/\n*(kind regards|best regards|cordialement|sincèrement)[\s\S]*/gi, "").trimEnd();
  }

  const name = senderName();
  const signature = name ? `Kind regards,\n${name}` : "Kind regards,";
  result = `${result.trimEnd()}\n\n${signature}`;

  return result;
}

function encodeSubject(subject: string): string {
  return /[^\x00-\x7F]/.test(subject)
    ? `=?utf-8?B?${Buffer.from(subject, "utf-8").toString("base64")}?=`
    : subject;
}

function toHtml(text: string): string {
  const esc = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return esc
    .split(/\n\n+/)
    .map((para) => `<p style="margin:0 0 1em 0;font-family:sans-serif">${para.replace(/\n/g, "<br>")}</p>`)
    .join("\n");
}

function encodeMail(to: string, subject: string, body: string, from?: string): string {
  const formatted = formatBody(body, to);
  const lines = [
    from ? `From: ${from}` : "",
    `To: ${to}`,
    `Subject: ${encodeSubject(subject)}`,
    "MIME-Version: 1.0",
    "Content-Type: text/html; charset=utf-8",
    "",
    toHtml(formatted),
  ].filter((l, i) => i !== 0 || l !== "");
  return Buffer.from(lines.join("\r\n")).toString("base64url");
}

export const gmailTools = {
  previewEmail: {
    description: "Preview how an email will look once formatted, WITHOUT sending it. Always call this before sendEmail so the user can confirm.",
    params: {
      type: "object",
      properties: {
        to: { type: "string", description: "Recipient email" },
        subject: { type: "string", description: "Subject line" },
        body: { type: "string", description: "Plain text body" },
      },
      required: ["to", "subject", "body"],
    } as const,
    handler({ to, subject, body }: { to: string; subject: string; body: string }): string {
      return `To: ${to}\nSubject: ${subject}\n\n${formatBody(body, to)}`;
    },
  },

  sendEmail: {
    description: "Send an email via Gmail. Only call this after showing a previewEmail and getting the user's confirmation.",
    params: {
      type: "object",
      properties: {
        to: { type: "string", description: "Recipient email" },
        subject: { type: "string", description: "Subject line" },
        body: { type: "string", description: "Plain text body" },
      },
      required: ["to", "subject", "body"],
    } as const,
    async handler({ to, subject, body }: { to: string; subject: string; body: string }): Promise<string> {
      const gmail = getClient();
      const raw = encodeMail(to, subject, body);
      const { data } = await gmail.users.messages.send({ userId: "me", requestBody: { raw } });
      return `Email sent. Message ID: ${data.id}`;
    },
  },

  createDraft: {
    description: "Save an email as a Gmail draft without sending.",
    params: {
      type: "object",
      properties: {
        to: { type: "string", description: "Recipient email" },
        subject: { type: "string", description: "Subject line" },
        body: { type: "string", description: "Plain text body" },
      },
      required: ["to", "subject", "body"],
    } as const,
    async handler({ to, subject, body }: { to: string; subject: string; body: string }): Promise<string> {
      const gmail = getClient();
      const raw = encodeMail(to, subject, body);
      const { data } = await gmail.users.drafts.create({ userId: "me", requestBody: { message: { raw } } });
      return `Draft saved. Draft ID: ${data.id}`;
    },
  },

  listEmails: {
    description: "List or search Gmail messages.",
    params: {
      type: "object",
      properties: {
        query: { type: "string", description: "Gmail search e.g. 'from:boss@co.com', 'is:unread'. Empty for inbox." },
        maxResults: { type: "number", description: "Number of emails (default 10, max 20)" },
      },
    } as const,
    async handler({ query, maxResults }: { query?: string; maxResults?: number }): Promise<string> {
      const gmail = getClient();
      const limit = Math.min(maxResults ?? 10, 20);
      const { data } = await gmail.users.messages.list({
        userId: "me",
        q: query ?? "in:inbox",
        maxResults: limit,
      });

      if (!data.messages?.length) return "No emails found.";

      const details = await Promise.all(
        data.messages.map(async (m) => {
          const msg = await gmail.users.messages.get({ userId: "me", id: m.id!, format: "metadata",
            metadataHeaders: ["From", "Subject", "Date"] });
          const headers = msg.data.payload?.headers ?? [];
          const get = (name: string): string => headers.find((h) => h.name === name)?.value ?? "";
          return `ID: ${m.id}  |  From: ${get("From")}  |  Subject: ${get("Subject")}  |  Date: ${get("Date")}`;
        }),
      );

      return details.join("\n");
    },
  },

  readEmail: {
    description: "Read a full email by its ID.",
    params: {
      type: "object",
      properties: {
        id: { type: "string", description: "Message ID from listEmails" },
      },
      required: ["id"],
    } as const,
    async handler({ id }: { id: string }): Promise<string> {
      const gmail = getClient();
      const { data } = await gmail.users.messages.get({ userId: "me", id, format: "full" });
      const headers = data.payload?.headers ?? [];
      const get = (name: string): string => headers.find((h) => h.name === name)?.value ?? "";

      let body = "";
      const parts = data.payload?.parts ?? [];
      const textPart = parts.find((p) => p.mimeType === "text/plain");
      if (textPart?.body?.data) {
        body = Buffer.from(textPart.body.data, "base64").toString("utf-8");
      } else if (data.payload?.body?.data) {
        body = Buffer.from(data.payload.body.data, "base64").toString("utf-8");
      }

      return [
        `From: ${get("From")}`,
        `To: ${get("To")}`,
        `Date: ${get("Date")}`,
        `Subject: ${get("Subject")}`,
        "",
        body || "(no plain text body)",
      ].join("\n");
    },
  },
} satisfies ChatSessionModelFunctions;
