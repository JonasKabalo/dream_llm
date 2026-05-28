import type { ChatSessionModelFunctions } from "node-llama-cpp";

export const datetimeTools = {
  getCurrentDateTime: {
    description: "Get current date, time and timezone. Pass a timezone to convert.",
    params: {
      type: "object",
      properties: {
        timezone: { type: "string", description: "IANA timezone e.g. 'Europe/Paris'. Omit for local." },
      },
    } as const,
    handler({ timezone }: { timezone?: string }): { date: string; time: string; timezone: string; iso: string } {
      const now = new Date();
      const localTz = Intl.DateTimeFormat().resolvedOptions().timeZone;

      let tz = localTz;
      if (timezone?.trim()) {
        try {
          Intl.DateTimeFormat("en-US", { timeZone: timezone });
          tz = timezone;
        } catch {
          tz = localTz;
        }
      }

      return {
        date: now.toLocaleDateString("en-US", {
          weekday: "long", year: "numeric", month: "long", day: "numeric",
          timeZone: tz,
        }),
        time: now.toLocaleTimeString("en-US", {
          hour: "2-digit", minute: "2-digit", second: "2-digit",
          timeZone: tz,
        }),
        timezone: tz,
        iso: now.toISOString(),
      };
    },
  },
} satisfies ChatSessionModelFunctions;
