# DeepSeek Local API & CLI Client (`deepseek-local-api`)

Convert DeepSeek Web Chat into a zero-overhead, OpenAI-compatible local API server and interactive terminal CLI.

---

> [!IMPORTANT]
> ### ⚠️ Capabilities & Limitations Notice
> - **Text & Reasoning Generation Only**: This tool is designed strictly for high-quality **text generation and reasoning** (DeepSeek Chat & DeepSeek Reasoner R1).
> - **No Native Tool/Function Calling**: The DeepSeek Web API does not support native OpenAI-style JSON schema tool calling. If you are using this with an agent harness (such as **OpenCode**, **π / Pi**, **Hermes**, **Cursor**, etc.) that requires tool execution, configure your harness to use **prompt-based text tool calling** (where the model outputs tool calls in text blocks such as JSON/XML for the harness to parse).

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
# Run interactive chat
npx deepseek-local-api

# Or start the OpenAI-compatible local server
npx deepseek-local-api --server 3000
```

### 3. Or Install Globally
```bash
npm install -g deepseek-local-api

# Now available anywhere:
deepseek-local-api
# Or via short alias:
deepseek
```

---

## 🛠️ Usage Modes

### Mode 1: Interactive Terminal Chat
Run without arguments to start an interactive multi-turn conversation:
```bash
deepseek-local-api
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

### Mode 2: Single-Turn CLI Prompt
Send a quick prompt and stream the result directly to your terminal:
```bash
deepseek-local-api "Explain Dijkstra algorithm in simple terms"
```

---

### Mode 3: OpenAI-Compatible Local Server
Run a local API server compatible with any OpenAI API client:
```bash
# Start on localhost (127.0.0.1:3000)
deepseek-local-api --server 3000

# Expose to your local network / LAN (0.0.0.0:8080)
deepseek-local-api --server 8080 --network
```

#### Supported Endpoints:
- `POST http://localhost:3000/v1/chat/completions`
  - Supports standard OpenAI payload (`model`, `messages`, `stream`).
  - Supports both **Streaming** (`stream: true` via SSE) and **Non-Streaming** (`stream: false`).
  - Includes `reasoning_content` delta for thinking process.
  - Full **CORS** enabled.
- `GET http://localhost:3000/v1/models`
  - Returns `deepseek-chat` and `deepseek-reasoner`.
- `GET http://localhost:3000/health`
  - Health check endpoint.

---

## 🤖 Harness Integration Guide (OpenCode, π / Pi, Hermes, Cursor, Continue)

You can plug this server into any AI harness or coding tool by pointing it to your local endpoint:

### Configuration Settings
| Setting | Value |
| :--- | :--- |
| **Base URL** | `http://localhost:3000/v1` |
| **API Key** | `dummy-token` *(any non-empty string)* |
| **Models** | `deepseek-chat` or `deepseek-reasoner` |
| **Streaming** | Enabled (`true`) |

---

### Recommended System Prompt for Harnesses & Agents

Copy and paste this system prompt into your harness configuration (OpenCode, Pi, Hermes, etc.) to ensure optimal performance and prompt-based tool parsing:

```text
You are an AI programming assistant powered by DeepSeek via a local OpenAI-compatible API provider.

CRITICAL OPERATIONAL RULES:
1. Native API-level function/tool calling is NOT supported by this provider.
2. All tool usage must follow a strict text-based format. When you need to execute an action (reading a file, running a shell command, searching, etc.), output your request in a structured code block:
   ```json
   {
     "action": "<tool_name>",
     "parameters": {
       "<param_key>": "<param_value>"
     }
   }
   ```
3. When reasoning is required, clearly structure your thinking before providing the final answer.
4. Keep answers concise, actionable, and focused on code execution.
```

---

## 📄 License
MIT
