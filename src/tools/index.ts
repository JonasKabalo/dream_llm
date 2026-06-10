import type { ChatSessionModelFunctions } from "node-llama-cpp";

import { calcTools } from "./offline/calc.js";
import { datetimeTools } from "./offline/datetime.js";
import { dateutilsTools } from "./offline/dateutils.js";
import { filesystemTools } from "./offline/filesystem.js";
import { clipboardTools } from "./offline/clipboard.js";
import { systemTools } from "./offline/system.js";
import { notesTools } from "./offline/notes.js";
import { terminalTools } from "./offline/terminal.js";

import { weatherTools } from "./online/weather.js";
import { githubTools } from "./online/github.js";
import { gmailTools } from "./online/gmail.js";
import { apolloTools } from "./online/apollo.js";

// Translate raw errors into messages the model can act on. A 14B model can't
// do anything useful with "invalid_grant", but it CAN relay clear instructions.
function describeToolError(name: string, e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  if (/invalid_grant/i.test(msg)) {
    return `Tool error in ${name}: Gmail authorization has expired or been revoked. Tell the user to run "dream setup-gmail" to reconnect their Google account, then ask again.`;
  }
  if (/(ENOTFOUND|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN|fetch failed)/i.test(msg)) {
    return `Tool error in ${name}: network unreachable. Tell the user this tool needs an internet connection.`;
  }
  return `Tool error in ${name}: ${msg}`;
}

// Wraps every handler so a thrown error is returned as a string to the AI
// instead of crashing the process. Exported for tests.
export function safe(tools: ChatSessionModelFunctions): ChatSessionModelFunctions {
  return Object.fromEntries(
    Object.entries(tools).map(([name, tool]) => {
      const original = tool.handler as (p: Record<string, unknown>) => unknown;
      return [name, {
        ...tool,
        handler: (params: Record<string, unknown>): unknown => {
          try {
            const ret = original(params);
            if (ret instanceof Promise) {
              return ret.catch((e: unknown) => describeToolError(name, e));
            }
            return ret;
          } catch (e) {
            return describeToolError(name, e);
          }
        },
      }];
    }),
  ) as ChatSessionModelFunctions;
}

export const allTools: ChatSessionModelFunctions = safe({
  ...calcTools,
  ...datetimeTools,
  ...dateutilsTools,
  ...filesystemTools,
  ...clipboardTools,
  ...systemTools,
  ...notesTools,
  ...terminalTools,
  ...weatherTools,
  ...githubTools,
  ...gmailTools,
  ...apolloTools,
});
