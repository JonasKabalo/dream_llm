import type { ChatSessionModelFunctions } from "node-llama-cpp";

type DateUnit = "days" | "weeks" | "months" | "years";

function parseDate(input: string): Date {
  const d = new Date(input);
  if (isNaN(d.getTime())) throw new Error(`Cannot parse date: "${input}". Use YYYY-MM-DD format.`);
  return d;
}

function formatFull(d: Date): string {
  return d.toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
}

export const dateutilsTools = {
  calculateDate: {
    description: "Add or subtract time from a date. Use 'today' as baseDate.",
    params: {
      type: "object",
      properties: {
        baseDate: { type: "string", description: "YYYY-MM-DD or 'today'" },
        amount: { type: "number", description: "Units to add (negative to subtract)" },
        unit: { type: "string", description: "days, weeks, months, or years" },
      },
      required: ["baseDate", "amount", "unit"],
    } as const,
    handler({ baseDate, amount, unit }: { baseDate: string; amount: number; unit: string }): string {
      const d = baseDate === "today" ? new Date() : parseDate(baseDate);

      switch (unit as DateUnit) {
        case "days":   d.setDate(d.getDate() + amount); break;
        case "weeks":  d.setDate(d.getDate() + amount * 7); break;
        case "months": d.setMonth(d.getMonth() + amount); break;
        case "years":  d.setFullYear(d.getFullYear() + amount); break;
        default: return `Unknown unit: "${unit}". Use days, weeks, months, or years.`;
      }

      return `${formatFull(d)} (${d.toISOString().slice(0, 10)})`;
    },
  },

  dateDifference: {
    description: "Days between two dates.",
    params: {
      type: "object",
      properties: {
        from: { type: "string", description: "YYYY-MM-DD or 'today'" },
        to: { type: "string", description: "YYYY-MM-DD or 'today'" },
      },
      required: ["from", "to"],
    } as const,
    handler({ from, to }: { from: string; to: string }): string {
      const d1 = from === "today" ? new Date() : parseDate(from);
      const d2 = to === "today" ? new Date() : parseDate(to);
      const diffMs = d2.getTime() - d1.getTime();
      const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
      const weeks = Math.floor(Math.abs(diffDays) / 7);
      const days = Math.abs(diffDays) % 7;
      const direction = diffDays >= 0 ? "from now" : "ago";
      const parts = [weeks && `${weeks} week${weeks > 1 ? "s" : ""}`, days && `${days} day${days > 1 ? "s" : ""}`]
        .filter(Boolean)
        .join(" and ");
      return `${Math.abs(diffDays)} days (${parts || "0 days"}) ${direction}`;
    },
  },
} satisfies ChatSessionModelFunctions;
