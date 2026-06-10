import fs from "fs";
import path from "path";
import os from "os";
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
          // Google occasionally rotates the refresh token — persist the new one
          // or the stored one eventually goes stale (invalid_grant).
          refreshToken: tokens.refresh_token ?? creds.refreshToken,
          expiryDate: tokens.expiry_date ?? creds.expiryDate,
        },
      });
    }
  });

  return google.gmail({ version: "v1", auth });
}

const GREETING_PATTERNS = /^(hi|hey|hello|dear|good\s+(?:morning|afternoon|evening)|bonjour|salut)\b/i;
// A sign-off only counts when a paragraph BEGINS with it ("Kind regards,",
// "Sincerely yours, Jonas"). Matching these words anywhere used to chop real
// sentences — "I sincerely enjoyed our chat…" lost everything after "I".
const CLOSING_START = /^(?:(?:kind|warm|best|many)\s+regards|warm\s+wishes|best\s+wishes|yours\s+sincerely|sincerely\s+yours|sincerely|cordially|cordialement|sinc[eè]rement|amicalement)\b/i;

function recipientFirstName(to: string): string {
  // Accept both "addr@example.com" and "Name <addr@example.com>"
  const addr = /<([^>]+)>/.exec(to)?.[1] ?? to;
  const local = addr.split("@")[0];
  const cleaned = local.replace(/\d+/g, "");
  const first = cleaned.split(/[.\-_]+/)[0];
  if (!first) return "there";
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

// Drop any model-written sign-off (and whatever follows it, e.g. the name
// line) so the canonical signature is never duplicated. Runs BEFORE paragraph
// reflow so "…\nKind regards,\nJonas" is still line-structured. Only cuts when
// a non-first LINE starts with a closing phrase — never mid-sentence.
function stripModelSignoff(body: string): string {
  const lines = body.split("\n");
  const idx = lines.findIndex((l, i) => i > 0 && CLOSING_START.test(l.trim()));
  return idx > 0 ? lines.slice(0, idx).join("\n") : body;
}

// Exported for tests.
export function formatBody(body: string, to: string): string {
  let result = reflowParagraphs(stripModelSignoff(body.trim()));

  if (!GREETING_PATTERNS.test(result)) {
    result = `Hi ${recipientFirstName(to)},\n\n${result}`;
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

  getEmailStats: {
    description: "Get exact mailbox totals for the whole Gmail account: total number of emails ever, total conversation threads, and the email address. Use this when the user asks how many emails they have overall or since the account began.",
    params: { type: "object", properties: {} } as const,
    async handler(): Promise<string> {
      const gmail = getClient();
      const { data } = await gmail.users.getProfile({ userId: "me" });
      return [
        `Email address: ${data.emailAddress}`,
        `Total emails in the account: ${data.messagesTotal}`,
        `Total conversation threads: ${data.threadsTotal}`,
      ].join("\n");
    },
  },

  countEmails: {
    description: "Count exactly how many emails match a Gmail search query, e.g. 'from:easyjet.com', 'subject:(booking confirmation) after:2013/01/01', 'is:sent'. For the total of ALL emails in the account, use getEmailStats instead.",
    params: {
      type: "object",
      properties: {
        query: { type: "string", description: "Gmail search query (same syntax as the Gmail search bar)" },
      },
      required: ["query"],
    } as const,
    async handler({ query }: { query: string }): Promise<string> {
      const gmail = getClient();
      let count = 0;
      let pageToken: string | undefined;
      // Pages of 500 IDs are cheap; cap at 40 pages (20,000 emails) for sanity.
      for (let page = 0; page < 40; page++) {
        const { data } = await gmail.users.messages.list({
          userId: "me",
          q: query,
          maxResults: 500,
          pageToken,
        });
        count += data.messages?.length ?? 0;
        pageToken = data.nextPageToken ?? undefined;
        if (!pageToken) return `${count} emails match "${query}".`;
      }
      return `More than ${count} emails match "${query}" (stopped counting at ${count}).`;
    },
  },

  exportEmailsToCsv: {
    description: "Export ALL emails matching a Gmail search query to a CSV file (columns: date, from, to, subject, gmail link), sorted oldest first. Use this whenever the user wants a complete list, report, or file of matching emails (e.g. all flight bookings) — unlike listEmails it has NO 20-result limit. Returns the file path and exact match count; do NOT re-type the rows afterwards.",
    params: {
      type: "object",
      properties: {
        query: { type: "string", description: "Gmail search query, e.g. 'from:easyjet.com subject:booking (Nice OR London)'" },
        filePath: { type: "string", description: "Where to save the CSV. Defaults to ~/Desktop/dream-emails-<timestamp>.csv" },
        maxEmails: { type: "number", description: "Safety cap (default 1000)" },
      },
      required: ["query"],
    } as const,
    async handler({ query, filePath, maxEmails }: { query: string; filePath?: string; maxEmails?: number }): Promise<string> {
      const gmail = getClient();
      const cap = Math.min(maxEmails ?? 1000, 5000);

      // 1. Collect ALL matching message IDs (paginated, 500 per page)
      const ids: string[] = [];
      let pageToken: string | undefined;
      do {
        const { data } = await gmail.users.messages.list({
          userId: "me",
          q: query,
          maxResults: Math.min(500, cap - ids.length),
          pageToken,
        });
        for (const m of data.messages ?? []) if (m.id) ids.push(m.id);
        pageToken = data.nextPageToken ?? undefined;
      } while (pageToken && ids.length < cap);

      if (ids.length === 0) return `No emails match "${query}" — nothing exported. Try a broader query.`;

      // 2. Fetch metadata with bounded concurrency (Gmail quota friendly)
      type Row = { ts: number; date: string; from: string; to: string; subject: string; link: string };
      const rows: Row[] = [];
      const CONCURRENCY = 10;
      for (let i = 0; i < ids.length; i += CONCURRENCY) {
        const chunk = await Promise.all(
          ids.slice(i, i + CONCURRENCY).map(async (id) => {
            const { data } = await gmail.users.messages.get({
              userId: "me", id, format: "metadata", metadataHeaders: ["From", "To", "Subject", "Date"],
            });
            const headers = data.payload?.headers ?? [];
            const get = (name: string): string => headers.find((h) => h.name === name)?.value ?? "";
            const ts = Number(data.internalDate ?? 0);
            return {
              ts,
              date: ts ? new Date(ts).toISOString().slice(0, 16).replace("T", " ") : get("Date"),
              from: get("From"),
              to: get("To"),
              subject: get("Subject"),
              link: `https://mail.google.com/mail/u/0/#all/${id}`,
            };
          }),
        );
        rows.push(...chunk);
      }
      rows.sort((a, b) => a.ts - b.ts);

      // 3. Write CSV
      const esc = (s: string): string => `"${s.replace(/"/g, '""')}"`;
      const csv = ["date,from,to,subject,gmail_link",
        ...rows.map((r) => [r.date, r.from, r.to, r.subject, r.link].map(esc).join(",")),
      ].join("\n") + "\n";

      const stamp = new Date().toISOString().slice(0, 19).replace(/[T:]/g, "-");
      const target = filePath
        ? path.resolve(filePath.replace(/^~/, os.homedir()))
        : path.join(os.homedir(), "Desktop", `dream-emails-${stamp}.csv`);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, csv, "utf-8");

      const capped = ids.length >= cap ? ` (capped at ${cap} — narrow the query or raise maxEmails for more)` : "";
      return `Exported ${rows.length} emails matching "${query}" to ${target}${capped}. Columns: date, from, to, subject, gmail_link (oldest first). Tell the user the file location — do not re-type the rows.`;
    },
  },

  listEmails: {
    description: "List or search Gmail messages, newest first (max 20 per call — NOT the total; use countEmails/getEmailStats for counts, exportEmailsToCsv for complete lists). Supports full Gmail search syntax: from:, to:, subject:, after:YYYY/MM/DD, before:, OR, quotes. Examples: 'from:ryanair.com OR from:easyjet.com', 'subject:(booking confirmation) after:2013/01/01'. Returns metadata only — use readEmail with an ID for full content.",
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
