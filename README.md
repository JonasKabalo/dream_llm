# Dream

Your personal local AI assistant — powered by **Phi-4 14B**, running fully offline on Apple Silicon. No cloud. No subscription. No data leaving your machine.

---

## Features

### Offline (no internet required)
| Tool | Example |
|---|---|
| Date & time | "What time is it in Tokyo?" |
| Files | "Create / read / move / copy / delete / search files" |
| Clipboard | "Copy this to my clipboard" |
| System info | "How much memory am I using? Battery level?" |
| Open apps | "Open Spotify" / "Open ~/Desktop/report.pdf" |
| Notes | "Save a note called Ideas" / "Show my notes" |
| Date calculator | "What day is it in 3 weeks?" |
| Terminal | "Run git status" — always asks confirmation first |

### Online (require internet)
| Tool | Example |
|---|---|
| Weather | "What's the weather in Paris?" |
| Gmail | "Send an email to..." / "What's in my inbox?" |
| GitHub | "List my repos" / "Create a PR" / "Open an issue" |

---

## Requirements

- Mac with Apple Silicon (M1 / M2 / M3 / M4)
- Node.js 18+
- ~10 GB free disk space (for the model)

---

## Install

```bash
npm install -g dream-local
```

Then download the model (~8.5 GB, one time):

```bash
dream setup
```

That's it. Run `dream` to start.

---

## Optional: connect integrations

### Gmail
```bash
dream setup-gmail
```
You need OAuth 2.0 credentials from [Google Cloud Console](https://console.cloud.google.com):
1. Create a project → Enable **Gmail API**
2. Create OAuth client ID → **Desktop app**
3. Add your Google account as a test user under OAuth consent screen
4. Run the command above — your browser opens, you approve, done

### GitHub
```bash
dream setup-github
```
You need a [Personal Access Token](https://github.com/settings/tokens/new) with `repo` and `read:user` scopes.

Credentials are stored in `~/.dream/credentials.json` — outside any project, never shared.

---

## Usage

```bash
dream
```

Type `/tools-list` at any time to see all available tools with examples.

---

## Commands

| Command | What it does |
|---|---|
| `dream` | Start the assistant |
| `dream setup` | Download the AI model |
| `dream setup-gmail` | Connect your Gmail account |
| `dream setup-github` | Connect your GitHub account |
| `dream update` | Update to the latest version |
| `dream version` | Show the installed version |

Inside the assistant:

| Slash command | What it does |
|---|---|
| `/tools-list` | List all available tools |

---

## Update

```bash
dream update
```

This checks npm for a newer version and installs it automatically.

---

## Uninstall

```bash
npm uninstall -g dream-local
```

To also remove your credentials and downloaded model:

```bash
rm -rf ~/.dream
```

---

## For developers

```bash
git clone https://github.com/YOUR_USERNAME/dream.git
cd dream
npm install
npm run setup          # download model to ~/.dream/models/
npm start              # run with hot-reload via tsx

npm run setup-github   # connect GitHub (local dev)
npm run setup-gmail    # connect Gmail (local dev)
```

To publish a new version:

```bash
# bump version in package.json, then:
npm run build
npm publish
```

---

## Project structure

```
src/
├── main.ts           entry point — CLI routing + REPL loop
├── agent.ts          agent class
├── model.ts          Phi-4 model wrapper (node-llama-cpp)
├── config.ts         model path, sender name, system prompt
├── credentials.ts    credential store (~/.dream/credentials.json)
├── commands.ts       slash command router
├── ui.ts             terminal UI (chalk, spinner, banner)
├── setup/
│   ├── model.ts      model downloader  (dream setup)
│   ├── github.ts     GitHub PAT setup  (dream setup-github)
│   └── gmail.ts      Gmail OAuth setup (dream setup-gmail)
└── tools/
    ├── index.ts      combines all tools
    ├── offline/      no internet required
    │   ├── datetime.ts
    │   ├── dateutils.ts
    │   ├── filesystem.ts
    │   ├── clipboard.ts
    │   ├── system.ts
    │   ├── notes.ts
    │   └── terminal.ts
    └── online/       requires internet
        ├── weather.ts
        ├── github.ts
        └── gmail.ts

scripts/              local dev helpers (not shipped in npm package)
├── setup.ts
├── setup-github.ts
└── setup-gmail.ts
```

---

## Stack

- **Model**: [Phi-4 14B Q4_K_M](https://huggingface.co/bartowski/phi-4-GGUF) by Microsoft
- **Runtime**: [node-llama-cpp](https://github.com/withcatai/node-llama-cpp) with Metal GPU acceleration
- **Language**: TypeScript (strict mode)
