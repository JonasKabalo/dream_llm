import type { ChatSessionModelFunctions } from "node-llama-cpp";

export const datetimeTools = {
  getCurrentDateTime: {
    description:
      "Get the current date and time. Optionally pass a timezone (e.g. 'Europe/Paris', 'America/New_York') " +
      "to get the time in that location. Works fully offline.",
    params: {
      type: "object",
      properties: {
        timezone: {
          type: "string",
          description: "IANA timezone name, e.g. 'Europe/Paris'. Omit to use the user's local timezone.",
        },
      },
    } as const,
    handler({ timezone }: { timezone?: string }): { date: string; time: string; timezone: string; iso: string } {
      const now = new Date();
      const tz = timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
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
