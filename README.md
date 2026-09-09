# DeepSeek Local API & CLI Client (`deepseek-local-api`)

Convert DeepSeek Web Chat into a zero-overhead, OpenAI-compatible local API server and interactive terminal CLI.

---

> [!IMPORTANT]
> ### 🧠 The Brain & Hands Bridge: `delegate-to-deepseek` Skill
> - **Pure Text & Deep Reasoning**: This local gateway converts DeepSeek into an OpenAI-compatible endpoint for world-class code synthesis and R1 reasoning. DeepSeek operates in **pure text (no native tool calling)**.
> - **The Hands (Your Agent Harness)**: Agents like **Hermes**, **Claude Code**, **Cursor**, **OpenCode**, and **Antigravity** possess the actual tools (`write_to_file`, `replace_file_content`, `run_command`).
> - **Install the Official Skill via skills.sh (Vercel)**:
>   ```bash
>   npx skills add m-elramsesy/deepseek-local-api --skill delegate-to-deepseek -g
>   ```
>   *Registry*: [skills.sh/m-elramsesy/deepseek-local-api/delegate-to-deepseek](https://skills.sh/m-elramsesy/deepseek-local-api/delegate-to-deepseek)

---

## ⚡ Quick Start

### 1. Set Your Token
Obtain your token from [chat.deepseek.com](https://chat.deepseek.com):
1. Sign in to [chat.deepseek.com](https://chat.deepseek.com).
2. Open DevTools (**F12**), go to **Application** > **Local Storage**.
3. Copy the value of `userToken`.
4. Create a `.env` file in your directory:
   ```env
   DEEPSEEK_TOKEN="your_token_here"
   ```

### 2. Run Directly with npx
```bash
# Start the OpenAI-compatible local server on port 4040
npx @ramsesy/deepseek-local-api -s 4040

# Or launch interactive terminal chat
npx @ramsesy/deepseek-local-api
```

### 3. Or Install Globally
```bash
npm install -g @ramsesy/deepseek-local-api

# Start local server anywhere:
deepseek -s 4040
```

---

## 🧠 Official Agent Skill: `delegate-to-deepseek` (skills.sh)

> **MANDATORY FOR ANY HARNESS OR CODING AGENT**
> When using this local API server with any agent harness (such as **Hermes**, **Claude Code**, **OpenCode**, **Cursor**, **Continue**, **Antigravity**), the agent **must** have the `delegate-to-deepseek` skill installed.

### 📥 One-Line Installation via Vercel's Skills CLI
```bash
# Install globally for all your AI agents:
npx skills add m-elramsesy/deepseek-local-api --skill delegate-to-deepseek -g

# Or install specifically for the current project:
npx skills add m-elramsesy/deepseek-local-api --skill delegate-to-deepseek
```
*Skills Registry Listing:* **[https://skills.sh/m-elramsesy/deepseek-local-api/delegate-to-deepseek](https://skills.sh/m-elramsesy/deepseek-local-api/delegate-to-deepseek)**

### 🔄 How the Delegation Protocol Works:
1. **Context Packaging (Harness)**: Your agent gathers existing project files, error logs, or user requirements.
2. **Text Request (Gateway)**: The agent calls `http://localhost:4040/v1/chat/completions` (or uses `call-deepseek.js`).
3. **Deep Synthesis (DeepSeek)**: DeepSeek R1 / V3 reasons through the problem and generates 100% complete, un-truncated production code.
4. **Tool Execution (Harness)**: Your agent receives the pure text, extracts the code, and uses its native tools (`write_to_file`, `replace_file_content`, `run_command`) to create the file on disk or Desktop, run tests, and execute commands.

---

## 🛠️ Usage Modes

### Mode 1: OpenAI-Compatible Local Server
Run a local API server compatible with any OpenAI API client or agent harness:
```bash
# Start on localhost (127.0.0.1:4040)
deepseek --server 4040

# Expose to your local network / LAN (0.0.0.0:8080)
deepseek --server 8080 --network
```

#### Supported Endpoints:
- `POST http://localhost:4040/v1/chat/completions`
  - Supports standard OpenAI payload (`model`, `messages`, `stream`).
  - Supports both **Streaming** (`stream: true` via SSE) and **Non-Streaming** (`stream: false`).
  - Supports `reasoning_content` delta for R1 thinking process.
  - Automatic fallback to `.env` token if client sends placeholder/dummy keys.
  - Full **CORS** enabled.
- `GET http://localhost:4040/v1/models`
  - Returns `deepseek-chat` and `deepseek-reasoner`.
- `GET http://localhost:4040/health`
  - Health check endpoint.

---

### Mode 2: Interactive Terminal Chat
Run without arguments to start an interactive multi-turn conversation:
```bash
deepseek
```
**Interactive Features:**
- **Tab Autocomplete**: Type `/` and press `Tab` to see and autocomplete commands.
- **Arrow-Key Session Picker**: Use `↑` / `↓` to select from past saved sessions.
- **Live In-Chat Commands:**
  - `/help`: Display all available commands.
  - `/thinking`: Toggle reasoning/thinking mode on or off.
  - `/search`: Toggle web search mode on or off.
  - `/server [port]`: Launch the local OpenAI-compatible server on the fly.
  - `/new`: Start a fresh session.
  - `/id`: Print current session ID and direct web URL.
  - `/exit`: Quit session.

---

### Mode 3: Single-Turn CLI Prompt
Send a quick prompt and stream the result directly to your terminal:
```bash
deepseek "Explain Dijkstra algorithm in simple terms"
```

---

## 🤖 Harness Integration Guide (Hermes, OpenCode, Claude Code, Cursor)

Configure your harness to point to your local endpoint:

### Configuration Settings
| Setting | Value |
| :--- | :--- |
| **Base URL** | `http://localhost:4040/v1` |
| **API Key** | `dummy-token` *(any string; server uses your `.env` token)* |
| **Models** | `deepseek-chat` or `deepseek-reasoner` |
| **Streaming** | Enabled (`true`) |

### Bundled CLI Helper for Harnesses:
Harnesses can also directly query the gateway via the zero-dependency script:
```bash
node skills/delegate-to-deepseek/scripts/call-deepseek.js \
  --port 4040 \
  --prompt "Create a complete Node.js CLI script for rate-limiting"
```

---

## 📄 License
MIT
