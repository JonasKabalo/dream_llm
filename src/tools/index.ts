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

export const allTools: ChatSessionModelFunctions = {
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
};
