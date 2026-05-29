# Dream — Local AI Assistant

A fully local AI assistant powered by **Phi-4 14B**, running fully offline on your Mac via Apple Silicon (M-series). No cloud, no subscription, works offline.

Built with TypeScript and node-llama-cpp.

---

## Features

### Offline tools (no internet required)
| Tool | What you can say |
|---|---|
| ⏰ Date & time | "What time is it in Tokyo?" |
| 📄 Files | "Create / read / move / copy / delete / search files" |
| 📋 Clipboard | "Copy this to my clipboard" |
| 💻 System info | "How much memory am I using? Battery level?" |
| 🚀 Open apps | "Open Spotify" / "Open ~/Desktop/report.pdf" |
| 📝 Notes | "Save a note called Ideas" / "Show my notes" |
| 🗓 Date calculator | "What day is it in 3 weeks?" |
| ⚡ Terminal | "Run git status" — always asks confirmation first |

### Online tools (require internet)
| Tool | What you can say |
|---|---|
| 🌤 Weather | "What's the weather in Paris?" |
| 📧 Gmail | "Send an email to..." / "What's in my inbox?" |
| 🐙 GitHub | "List my repos" / "Create a PR" / "Open an issue" |

---

## Requirements

- Mac with Apple Silicon (M1/M2/M3/M4)
- Node.js 18+
- ~10 GB free disk space (for the model)

---

## Installation

```bash
git clone https://github.com/YOUR_USERNAME/dream_llm.git
cd dream_llm
npm install
npm run setup        # downloads Phi-4 14B (~8.4 GB, one time)
```

---

## Setup integrations (optional)

### GitHub
```bash
npm run setup-github
```
You'll need a [Personal Access Token](https://github.com/settings/tokens/new) with `repo` and `read:user` scopes.

### Gmail
```bash
npm run setup-gmail
```
You'll need OAuth 2.0 credentials from [Google Cloud Console](https://console.cloud.google.com):
1. Create a project → Enable **Gmail API**
2. Create OAuth client ID → **Desktop app**
3. Add your email as a test user under OAuth consent screen
4. Run the setup script — browser opens, you approve, done

Credentials are stored in `~/.dream/credentials.json` — outside this repo, never committed.

---

## Usage

```bash
npm start
```

Type `/tools-list` at any time to see all available tools and examples.

---

## Commands

| Command | Description |
|---|---|
| `/tools-list` | Show all available tools |

---

## Project structure

```
src/
├── main.ts           entry point, terminal loop
├── agent.ts          agent class
├── model.ts          Phi-4 model wrapper (node-llama-cpp)
├── config.ts         model path and system prompt
├── credentials.ts    credential store (~/.dream/credentials.json)
├── commands.ts       slash command router
├── ui.ts             terminal UI (chalk, spinner, banner)
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

scripts/
├── setup.ts          model downloader
├── setup-github.ts   GitHub PAT setup
└── setup-gmail.ts    Gmail OAuth setup
```

---

## Stack

- **Model**: [Phi-4 14B Q4_K_M](https://huggingface.co/bartowski/phi-4-GGUF) by Microsoft
- **Runtime**: [node-llama-cpp](https://github.com/withcatai/node-llama-cpp) with Metal GPU
- **Language**: TypeScript (strict mode)
- **Linting**: ESLint + @typescript-eslint

---

## Notes

- The model file (`*.gguf`) is excluded from git — run `npm run setup` after cloning
- Credentials (`~/.dream/credentials.json`) are stored outside the project directory
- The terminal tool always asks for confirmation before running any command
