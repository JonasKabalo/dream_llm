import { getApolloCreds } from "../../credentials.js";
import type { ChatSessionModelFunctions } from "node-llama-cpp";

const BASE = "https://api.apollo.io/api/v1";

function headers(): Record<string, string> {
  return {
    "Content-Type": "application/json",
    "X-Api-Key": getApolloCreds().apiKey,
  };
}

interface ApolloPerson {
  name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
  email_status?: string | null;
  title?: string | null;
  linkedin_url?: string | null;
  organization?: { name?: string | null } | null;
}

function formatPerson(p: ApolloPerson): string {
  const lines: string[] = [];
  if (p.name) lines.push(`Name: ${p.name}`);
  if (p.email) {
    const status = p.email_status && p.email_status !== "verified" ? ` (${p.email_status})` : "";
    lines.push(`Email: ${p.email}${status}`);
  } else {
    lines.push("Email: not available");
  }
  if (p.title) lines.push(`Title: ${p.title}`);
  if (p.organization?.name) lines.push(`Company: ${p.organization.name}`);
  if (p.linkedin_url) lines.push(`LinkedIn: ${p.linkedin_url}`);
  return lines.join("\n");
}

export const apolloTools = {
  findContact: {
    description: "Find a specific person's email and contact details by name and company using Apollo.io.",
    params: {
      type: "object",
      properties: {
        name: { type: "string", description: "Full name of the person e.g. 'Ryan Smith'" },
        company: { type: "string", description: "Company or organization name e.g. 'Stripe'" },
      },
      required: ["name", "company"],
    } as const,
    async handler({ name, company }: { name: string; company: string }): Promise<string> {
      const parts = name.trim().split(/\s+/);
      const firstName = parts[0] ?? "";
      const lastName = parts.slice(1).join(" ") || undefined;

      const res = await fetch(`${BASE}/people/match`, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({
          first_name: firstName,
          last_name: lastName,
          organization_name: company,
          reveal_personal_emails: true,
        }),
      });

      if (!res.ok) {
        return `Apollo API error: ${res.status} ${res.statusText}`;
      }

      const data = await res.json() as { person?: ApolloPerson | null };

      if (!data.person) {
        return `No match found for ${name} at ${company}.`;
      }

      return formatPerson(data.person);
    },
  },

  searchPeople: {
    description: "Search for people at a company by role or title using Apollo.io. Returns a list of contacts.",
    params: {
      type: "object",
      properties: {
        company: { type: "string", description: "Company or organization name e.g. 'Stripe'" },
        title: { type: "string", description: "Job title or role to filter by e.g. 'Hiring Manager', 'CTO'" },
        maxResults: { type: "number", description: "Number of results to return (default 5, max 10)" },
      },
      required: ["company"],
    } as const,
    async handler({ company, title, maxResults }: { company: string; title?: string; maxResults?: number }): Promise<string> {
      const limit = Math.min(maxResults ?? 5, 10);

      const body: Record<string, unknown> = {
        q_organization_name: company,
        per_page: limit,
        page: 1,
      };
      if (title) body.person_titles = [title];

      const res = await fetch(`${BASE}/people/search`, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        return `Apollo API error: ${res.status} ${res.statusText}`;
      }

      const data = await res.json() as {
        people?: ApolloPerson[];
        pagination?: { total_entries?: number };
      };

      if (!data.people?.length) {
        return `No people found at ${company}${title ? ` with title "${title}"` : ""}.`;
      }

      const total = data.pagination?.total_entries;
      const header = `Found ${data.people.length}${total ? ` of ${total}` : ""} people at ${company}${title ? ` (title: ${title})` : ""}:\n`;

      return header + data.people.map((p, i) => `\n[${i + 1}]\n${formatPerson(p)}`).join("\n");
    },
  },
} satisfies ChatSessionModelFunctions;
