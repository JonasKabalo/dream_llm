import type { ChatSessionModelFunctions } from "node-llama-cpp";

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

// Wraps every handler so a thrown error is returned as a string to the AI
// instead of crashing the process.
function safe(tools: ChatSessionModelFunctions): ChatSessionModelFunctions {
  return Object.fromEntries(
    Object.entries(tools).map(([name, tool]) => {
      const original = tool.handler as (p: Record<string, unknown>) => unknown;
      return [name, {
        ...tool,
        handler: (params: Record<string, unknown>): unknown => {
          try {
            const ret = original(params);
            if (ret instanceof Promise) {
              return ret.catch(
                (e: unknown) => `Tool error in ${name}: ${e instanceof Error ? e.message : String(e)}`,
              );
            }
            return ret;
          } catch (e) {
            return `Tool error in ${name}: ${e instanceof Error ? e.message : String(e)}`;
          }
        },
      }];
    }),
  ) as ChatSessionModelFunctions;
}

export const allTools: ChatSessionModelFunctions = safe({
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
});
