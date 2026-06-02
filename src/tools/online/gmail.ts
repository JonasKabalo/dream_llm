import fs from "fs";
import { google } from "googleapis";
import { getGmailCreds, saveCredentials } from "../../credentials.js";
import { SENDER_NAME, CV_PATH } from "../../config.js";
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
const CLOSING_PATTERNS = /\b(kind|warm|best|many)\s+regards|warm\s+wishes|best\s+wishes|yours\s+sincerely|sincerely\s+yours|sincerely|cordially|cordialement|sincèrement|amicalement/i;

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
    result = result.replace(/\n*(\b(kind|warm|best|many)\s+regards|warm\s+wishes|best\s+wishes|yours\s+sincerely|sincerely\s+yours|sincerely|cordially|cordialement|sincèrement|amicalement)[\s\S]*/gi, "").trimEnd();
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

function encodeMail(to: string, subject: string, body: string, attachCv?: boolean, from?: string): string {
  const formatted = formatBody(body, to);
  const htmlBody = toHtml(formatted);

  const cvBuffer = attachCv && fs.existsSync(CV_PATH) ? fs.readFileSync(CV_PATH) : null;

  if (!cvBuffer) {
    const lines = [
      from ? `From: ${from}` : "",
      `To: ${to}`,
      `Subject: ${encodeSubject(subject)}`,
      "MIME-Version: 1.0",
      "Content-Type: text/html; charset=utf-8",
      "",
      htmlBody,
    ].filter((l, i) => i !== 0 || l !== "");
    return Buffer.from(lines.join("\r\n")).toString("base64url");
  }

  const boundary = `dream_boundary_${Date.now()}`;
  const cvName = "CV_Jonas_Kabalo.pdf";
  const cvBase64 = cvBuffer.toString("base64");

  const parts = [
    `--${boundary}`,
    "Content-Type: text/html; charset=utf-8",
    "",
    htmlBody,
    "",
    `--${boundary}`,
    `Content-Type: application/pdf; name="${cvName}"`,
    `Content-Disposition: attachment; filename="${cvName}"`,
    "Content-Transfer-Encoding: base64",
    "",
    cvBase64,
    `--${boundary}--`,
  ].join("\r\n");

  const headers = [
    from ? `From: ${from}` : "",
    `To: ${to}`,
    `Subject: ${encodeSubject(subject)}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    "",
    parts,
  ].filter((l, i) => i !== 0 || l !== "");

  return Buffer.from(headers.join("\r\n")).toString("base64url");
}

export const gmailTools = {
  previewEmail: {
    description: "Preview how an email will look once formatted, WITHOUT sending it. Always call this before sendEmail so the user can confirm. Set attachCv: true to indicate the CV will be attached.",
    params: {
      type: "object",
      properties: {
        to: { type: "string", description: "Recipient email" },
        subject: { type: "string", description: "Subject line" },
        body: { type: "string", description: "Plain text body (no sign-off — it is added automatically)" },
        attachCv: { type: "boolean", description: "Set true to attach the stored CV (~/. dream/cv.pdf)" },
      },
      required: ["to", "subject", "body"],
    } as const,
    handler({ to, subject, body, attachCv }: { to: string; subject: string; body: string; attachCv?: boolean }): string {
      let preview = `To: ${to}\nSubject: ${subject}\n`;
      if (attachCv) {
        const cvStatus = fs.existsSync(CV_PATH) ? `Attachment: CV_Jonas_Kabalo.pdf` : `Attachment: CV not found at ${CV_PATH} — call importCV first`;
        preview += `${cvStatus}\n`;
      }
      preview += `\n${formatBody(body, to)}`;
      return preview;
    },
  },

  sendEmail: {
    description: "Send an email via Gmail. Only call this after showing a previewEmail and getting the user's confirmation. Set attachCv: true to attach the stored CV.",
    params: {
      type: "object",
      properties: {
        to: { type: "string", description: "Recipient email" },
        subject: { type: "string", description: "Subject line" },
        body: { type: "string", description: "Plain text body (no sign-off — it is added automatically)" },
        attachCv: { type: "boolean", description: "Set true to attach the stored CV (~/.dream/cv.pdf)" },
      },
      required: ["to", "subject", "body"],
    } as const,
    async handler({ to, subject, body, attachCv }: { to: string; subject: string; body: string; attachCv?: boolean }): Promise<string> {
      if (attachCv && !fs.existsSync(CV_PATH)) {
        return `Error: CV not found at ${CV_PATH}. Ask the user for their CV file path and call importCV to set it up first.`;
      }
      const gmail = getClient();
      const raw = encodeMail(to, subject, body, attachCv);
      const { data } = await gmail.users.messages.send({ userId: "me", requestBody: { raw } });
      const suffix = attachCv ? " (CV attached)" : "";
      return `Email sent${suffix}. Message ID: ${data.id}`;
    },
  },

  createDraft: {
    description: "Save an email as a Gmail draft without sending. Set attachCv: true to attach the stored CV.",
    params: {
      type: "object",
      properties: {
        to: { type: "string", description: "Recipient email" },
        subject: { type: "string", description: "Subject line" },
        body: { type: "string", description: "Plain text body (no sign-off — it is added automatically)" },
        attachCv: { type: "boolean", description: "Set true to attach the stored CV (~/.dream/cv.pdf)" },
      },
      required: ["to", "subject", "body"],
    } as const,
    async handler({ to, subject, body, attachCv }: { to: string; subject: string; body: string; attachCv?: boolean }): Promise<string> {
      if (attachCv && !fs.existsSync(CV_PATH)) {
        return `Error: CV not found at ${CV_PATH}. Ask the user for their CV file path and call importCV to set it up first.`;
      }
      const gmail = getClient();
      const raw = encodeMail(to, subject, body, attachCv);
      const { data } = await gmail.users.drafts.create({ userId: "me", requestBody: { message: { raw } } });
      const suffix = attachCv ? " (CV attached)" : "";
      return `Draft saved${suffix}. Draft ID: ${data.id}`;
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

      // Walk the MIME tree recursively to find the first text/plain part.
      // Gmail wraps text/plain inside multipart/alternative inside multipart/mixed,
      // so a flat find() on the top-level parts array misses nested plain-text parts.
      type Part = { mimeType?: string | null; body?: { data?: string | null } | null; parts?: Part[] | null };
      function findPlainText(part: Part): string | null {
        if (part.mimeType === "text/plain" && part.body?.data) {
          return Buffer.from(part.body.data, "base64").toString("utf-8");
        }
        for (const child of part.parts ?? []) {
          const found = findPlainText(child);
          if (found !== null) return found;
        }
        return null;
      }

      let body = "";
      const walked = data.payload ? findPlainText(data.payload as Part) : null;
      if (walked !== null) {
        body = walked;
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
