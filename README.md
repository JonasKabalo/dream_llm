# Dream

Your personal local AI assistant — powered by **Qwen3.5 9B** (native tool calling), running fully offline on your machine. No cloud. No subscription. No data leaving your machine.

---

## Features

### Offline (no internet required)
| Tool | Example |
|---|---|
| Calculator | "What's 23456 * 3938342?" — exact arithmetic via tool, never hallucinated |
| Date & time | "What time is it in Tokyo?" |
| Files | "Create / read / edit / move / copy / delete / search files" |
| PDF reader | "Read my CV" / "What are my skills in `~/.dream/cv.pdf`?" |
| Clipboard | "Copy this to my clipboard" |
| System info | "How much memory am I using? Battery level?" |
| Open apps | "Open Spotify" / "Open ~/Desktop/report.pdf" |
| Notes | "Save a note called Ideas" / "Show my notes" |
| Date calculator | "What day is it in 3 weeks?" |
| Terminal | "Run git status" — always asks confirmation, blocks destructive patterns |

### Online (require internet)
| Tool | Example |
|---|---|
| Weather | "What's the weather in Paris?" |
| Gmail | "Send an email to..." / "How many emails do I have?" / "Export all my flight bookings between London and Nice to a CSV" / "Attach my CV" |
| GitHub | "List my repos" / "Create a PR" / "Open an issue" |
| Apollo.io | "Find the hiring manager at Stripe" / "Find ryan@leotechnology.com" |

---

## Requirements

| Platform | Notes |
|---|---|
| **macOS** — Apple Silicon (M1/M2/M3/M4) | Metal GPU acceleration — best performance |
| **macOS** — Intel | CPU inference — works, slower |
| **Windows** 10 / 11 | CPU or CUDA (NVIDIA GPU recommended) |
| **Linux** (Ubuntu 20.04+, Debian, etc.) | CPU or CUDA (NVIDIA GPU recommended) |

- Node.js 18+
- ~10 GB free disk space (for the model)

---

## Install

```bash
npm install -g dream-local
```

Then download the model (~5.7 GB, one time):

```bash
dream setup
```

That's it. Run `dream` to start.

### Models

| Model | Size | Notes |
|---|---|---|
| **Qwen3.5 9B** (default) | ~5.7 GB | Native function calling, fast, leaves room for the full 16K context |
| Phi-4 14B (legacy) | ~8.4 GB | `DREAM_MODEL=phi4 dream` to run it; `DREAM_MODEL=phi4 dream setup` to download it |

If the default model isn't downloaded yet but Phi-4 is, Dream falls back to Phi-4 automatically.

---

## Optional: connect integrations

### Gmail
```bash
dream setup-gmail
```
You need OAuth 2.0 credentials from [Google Cloud Console](https://console.cloud.google.com):
1. Create a project → Enable **Gmail API**
2. Create OAuth client ID → **Desktop app**
3. Under **OAuth consent screen → Publishing status**, click **Publish app** (set it to *In production*)
4. Run the command above — your browser opens, you approve, done

> **⚠️ Important — keep the app "In production".** If you leave the OAuth app in
> *Testing* mode (with your account added as a test user), Google expires the
> login after **7 days** and every Gmail request fails with `invalid_grant`
> until you re-run `dream setup-gmail`. Publishing to production keeps the
> login alive indefinitely. The "unverified app" warning during authorization
> is expected and fine for personal use — click *Advanced → Continue*.

### CV attachment
Tell Dream where your CV is and it will store it for future emails:

```
you  › attach my cv to the email please
dream › Where is your CV file? Give me the path.
you  › ~/Desktop/JonasKabalo_CV.pdf
dream › CV saved. It will be attached whenever you ask.
```

Your CV is saved to `~/.dream/cv.pdf`. From that point on, just say "attach my CV" and Dream handles the rest — the file is embedded as a PDF attachment in the email.

### Apollo.io
```bash
dream setup-apollo
```
You need an API key from [Apollo.io Settings → Integrations → API](https://app.apollo.io/#/settings/integrations/api).

Once connected, you can ask Dream to find professional email addresses and contacts by name and company:

```
you  › find the hiring manager at Modo Energy
dream › [calls searchPeople] → Found 3 people at Modo Energy (title: Hiring Manager): ...

you  › find Ryan Lockyer at Leo Technology
dream › [calls findContact] → Name: Ryan Lockyer / Email: ryan@leotechnology.com / Title: Founder & Director
```

> **Note:** Contact search (`findContact`, `searchPeople`) requires a **Basic plan or higher** on Apollo.io. The free plan does not include API access to people search. The setup wizard works on any plan and will save your key — the tools will return a clear upgrade prompt if your plan doesn't cover the endpoint.

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
| `dream setup-apollo` | Connect your Apollo.io account |
| `dream update` | Update to the latest version |
| `dream version` | Show the installed version |

Inside the assistant:

| Slash command | What it does |
|---|---|
| `/tools-list` | List all available tools |
| `/keys` | Show all keyboard shortcuts |

### Keyboard shortcuts

| Key | What it does |
|---|---|
| `Enter` | Send message to Dream |
| `Ctrl+J` | Insert a new line (for multi-line messages) |
| `ESC` `ESC` | Clear the entire input (double-tap within 400 ms) |
| `ESC` | Cancel selection (single tap) |
| `⌥⌫` or `Ctrl+W` | Delete the word behind the cursor |
| `←` `→` `↑` `↓` | Move cursor (including across lines) |
| `Shift+↑` / `Shift+↓` | Extend selection one line up/down |
| `Shift+←` / `Shift+→` | Extend selection one character left/right |
| `Shift+Ctrl+↑` / `Shift+⌥+↑` | Select from cursor to the **start** of input |
| `Shift+Ctrl+↓` / `Shift+⌥+↓` | Select from cursor to the **end** of input |
| `Shift+Home` / `Shift+End` | Extend selection to start/end of current line |
| `Backspace` with selection | Delete selected text |
| Type with selection | Replace selected text |
| `Ctrl+C` / `Ctrl+D` | Exit Dream |

Multi-line paste (with indented text and newlines) is handled automatically — paste anything and the full text appears as a single editable block before you send it.

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

### Tests

```bash
npm test               # node:test suite — covers every tool
npm run typecheck      # strict TypeScript over src/ and tests/
npm run lint           # ESLint over src/ and tests/
```

The suite is safe to run anywhere: unit tests use temp directories
(`DREAM_CONFIG_DIR`, `DREAM_NOTES_DIR` overrides), live tests make **read-only**
calls with your real credentials and skip automatically when credentials or
network are missing (so CI always passes). Two tests are opt-in:
`DREAM_TEST_CLIPBOARD=1` (mutates your clipboard) and `DREAM_TEST_APOLLO=1`
(draws on Apollo plan quota).

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
├── main.ts           entry point — CLI loop
├── input.ts          raw-mode input handler (multi-line, paste, keyboard shortcuts)
├── layout.ts         sticky-input terminal layout (VT100 scroll region zones)
├── agent.ts          agent — tool dispatch + smart directory context injection
├── model.ts          Phi-4 model wrapper (node-llama-cpp) + streaming output filter
├── config.ts         model path, sender name, system prompt
├── credentials.ts    credential store (~/.dream/credentials.json)
├── commands.ts       slash command router
├── ui.ts             terminal UI (chalk, spinner, banner)
├── setup/
│   ├── model.ts      model downloader   (dream setup)
│   ├── github.ts     GitHub PAT setup   (dream setup-github)
│   ├── gmail.ts      Gmail OAuth setup  (dream setup-gmail)
│   └── apollo.ts     Apollo.io key setup (dream setup-apollo)
└── tools/
    ├── index.ts      combines all tools + error-to-string safety wrapper
    ├── offline/      no internet required
    │   ├── datetime.ts
    │   ├── dateutils.ts
    │   ├── filesystem.ts
    │   ├── clipboard.ts
    │   ├── system.ts
    │   ├── notes.ts
    │   └── terminal.ts   command sanitizer + confirmation prompt + blocked-pattern list
    └── online/       requires internet
        ├── weather.ts
        ├── github.ts
        ├── gmail.ts
        └── apollo.ts

tests/                node:test suite (npm test) — one file per area
scripts/              local dev helpers (not shipped in npm package)
├── setup.ts
├── setup-github.ts
├── setup-gmail.ts
└── setup-apollo.ts
```

---

## Stack

- **Model**: [Qwen3.5 9B Q4_K_M](https://huggingface.co/unsloth/Qwen3.5-9B-GGUF) (default) · [Phi-4 14B Q4_K_M](https://huggingface.co/bartowski/phi-4-GGUF) (legacy, `DREAM_MODEL=phi4`)
- **Runtime**: [node-llama-cpp](https://github.com/withcatai/node-llama-cpp) — Metal (macOS), CUDA (Windows/Linux), or CPU
- **Language**: TypeScript (strict mode)
