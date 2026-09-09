---
name: delegate-to-deepseek
description: Delegate heavy coding, full-file generation, architectural design, deep debugging, and code analysis to a local DeepSeek instance via deepseek-local-api gateway or CLI. Allows frontier models (Gemini in Antigravity, Claude in Claude Code, GPT-4o) or open agents (Hermes, OpenCode) to save tokens and avoid quota depletion by offloading heavy code generation to DeepSeek as a subagent or worker. DeepSeek acts as the pure-text reasoning brain, while the host harness executes the tool actions (file creation, edits, command execution).
license: MIT
metadata:
  version: "1.1.0"
  author: "m-elramsesy"
  compatibility: "Works with any agent harness (Hermes, Claude Code, Antigravity, OpenCode, Cursor, Continue) that possesses file and command tools."
  tags: "deepseek, local-api, code-generation, delegation, reasoning, code-analysis, subagent, token-saver, harness"
---

# Delegate to DeepSeek (The Brain & Hands Bridge)

Use this skill whenever you need to offload complex coding, complete file generation, architectural design, deep debugging, or in-depth code analysis to a local DeepSeek instance powered by **`deepseek-local-api`**.

---

## 💡 Why This Skill Exists: The Token Economics & Subagent Pattern

When using high-tier frontier models like **Gemini 2.5 on Antigravity**, **Claude 3.7 / Opus on Claude Code**, or **GPT-4o**:
- Generating large source code files (100–1000 lines), writing boilerplate, refactoring whole modules, or iterative debugging consumes **enormous amounts of expensive API tokens and rate limits**.
- DeepSeek Web (R1 & V3) offers world-class coding and reasoning capabilities, bridged via `deepseek-local-api` into an OpenAI-compatible local server at **zero token cost**.

### 🌟 The Architecture: Architect vs. Worker Subagent
```
┌────────────────────────────────────────────────────────┐
│     Frontier Host Agent (Gemini / Claude / Hermes)     │
│   • Role: The Architect & Supervisor                   │
│   • Tasks: Understands user requirements, plans steps  │
│   • Token Usage: Minimal (only high-level orchestration)│
└──────────────────────────┬─────────────────────────────┘
                           │ 1. Spawns Subagent / Executes Delegation
                           ▼
┌────────────────────────────────────────────────────────┐
│             DeepSeek Subagent / Local Gateway          │
│   • Role: The Coding Engine (Pure Brain)               │
│   • Tasks: Writes 100% complete files, algorithms, R1   │
│   • Cost: ZERO Tokens (Free unlimited local gateway)   │
└──────────────────────────┬─────────────────────────────┘
                           │ 2. Returns Clean Generated Code
                           ▼
┌────────────────────────────────────────────────────────┐
│     Frontier Host Agent (Gemini / Claude / Hermes)     │
│   • Role: The Hands (Tool Execution)                   │
│   • Actions: write_to_file, run syntax checks, tests   │
└────────────────────────────────────────────────────────┘
```

By delegating the raw file generation to DeepSeek, you **save over 80–90% of your primary model's token consumption** while maintaining the superior tool execution and project understanding of your host agent!

---

## 📥 Installation via skills.sh (Vercel)

Install this skill directly into your AI coding agent (Hermes, Claude Code, Cursor, Antigravity, OpenCode, Continue) using the official Vercel Skills CLI:

```bash
# Install to your agent environment:
npx skills add m-elramsesy/deepseek-local-api --skill delegate-to-deepseek

# Or install globally for all agents:
npx skills add m-elramsesy/deepseek-local-api --skill delegate-to-deepseek -g
```

> **Registry**: [https://skills.sh/m-elramsesy/deepseek-local-api/delegate-to-deepseek](https://skills.sh/m-elramsesy/deepseek-local-api/delegate-to-deepseek)

---

## 🚀 Practical Guide for Hermes, OpenCode & Coding Agents

Many agents fail in practical execution when they attempt to execute scripts using relative paths (`node skills/delegate-to-deepseek/...`) because the skill is installed globally in `~/.agents/` or `AppData/Local/hermes/`. 

To make this work **100% reliably in any directory without missing paths**:

### Step 0: Ensure the Local Gateway Server is Running

Before querying, check if the server is active:
```bash
curl -s http://127.0.0.1:4040/health
```
If not running (or returning Connection Refused), launch it in the background:
```bash
# Windows (PowerShell):
Start-Process -NoNewWindow -FilePath "npx" -ArgumentList "@ramsesy/deepseek-local-api -s 4040"

# Linux / macOS / Bash:
npx @ramsesy/deepseek-local-api -s 4040 &

# Or if installed globally:
deepseek -s 4040 &
```

---

### Step 1: Execute Delegation via Universal CLI (Zero Path Hassle)

You do **not** need to locate any local script file. Use the universal CLI subcommand `call` directly from any directory:

#### Option A: Direct File Generation with Auto-Code Extraction
```bash
# Writes the generated code directly to the target file!
npx @ramsesy/deepseek-local-api call -p "Write an Express.js rate limiter middleware with in-memory sliding window" -o ./src/rateLimiter.js
```
*Note: `-o <filepath>` automatically strips markdown backticks and writes clean, production-ready code directly to disk.*

#### Option B: Complex Reasoning & Refactoring with DeepSeek R1
```bash
# Offload deep reasoning / bug diagnosis to deepseek-reasoner
npx @ramsesy/deepseek-local-api call -p "Analyze why this algorithm causes a memory leak and fix it" -f ./src/heavy-module.js -m deepseek-reasoner -o ./src/heavy-module.js
```

#### Option C: Native HTTP API (Standard OpenAI Format)
Any agent with `curl` or HTTP capability can query the local endpoint:
```bash
curl -s http://127.0.0.1:4040/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "deepseek-chat",
    "messages": [
      {
        "role": "system",
        "content": "You are DeepSeek. Output 100% complete, production-grade code. No placeholders, no omissions."
      },
      {
        "role": "user",
        "content": "Create a robust TypeScript WebSocket reconnect client."
      }
    ]
  }'
```

---

### Step 2: Subagent Invocation Pattern

When working inside multi-agent frameworks (Antigravity, Claude Code, OpenCode, Hermes):

1. **Subagent Definition**: Configure a worker subagent with:
   - **Base URL**: `http://127.0.0.1:4040/v1`
   - **Model**: `deepseek-chat` (or `deepseek-reasoner`)
   - **API Key**: `dummy` (the local server uses the token configured in `.env`)
2. **Subagent Task**: Send the code generation task to this subagent:
   > *"Write the complete implementation of `userService.js` based on the database schema provided."*
3. **Supervisor Review**: The primary supervisor model (Gemini/Claude) reviews the code, checks for any missed requirements, and delegates file writing to host tools.

---

### Step 3: Tool Execution (The Host Agent's "Hands")

DeepSeek acts purely as the brain. The host agent (Hermes, Claude Code, Antigravity) uses its native tools to finalize:
1. **Write or Verify the File**:
   If not using `-o`, write the received code using your native tool (`write_to_file` or `create_file`).
2. **Syntax Validation**:
   Run syntax verification:
   ```bash
   node -c ./src/rateLimiter.js
   # or TypeScript check
   npx tsc --noEmit
   ```
3. **Execute Tests**:
   Run project tests to verify the generated implementation meets all test cases:
   ```bash
   npm test
   ```

---

## 📋 Recommended Prompting Templates

### 1. New File Generation Prompt
```text
Task: Create a new file at: [TARGET_FILE_PATH]

Requirements:
[DETAILED USER REQUIREMENTS]

Rules for output:
1. Provide the 100% COMPLETE code for this file. DO NOT truncate or leave placeholders.
2. Format as clean code. If enclosed in markdown, ensure standard code fence syntax.
3. Ensure all imports, exports, type definitions, and error handling are fully implemented.
```

### 2. Large File Refactoring & Optimization Prompt
```text
Task: Analyze and refactor the following existing file.

Target File: [TARGET_FILE_PATH]
Current Content:
```[LANGUAGE]
[PASTE CURRENT FILE CONTENT HERE]
```

Goal:
[USER REQUEST: e.g. fix memory leak, convert to async/await, add telemetry]

Rules for output:
1. Provide the complete updated file code block so the harness can overwrite or patch it directly.
2. Maintain all existing public APIs and edge cases.
```

### 3. Deep Bug Diagnosis (R1 Reasoner)
```text
Model: deepseek-reasoner
Task: Root-cause analysis and fix.

Error Trace:
[PASTE ERROR LOG / STACK TRACE]

Relevant source code:
```[LANGUAGE]
[PASTE SOURCE CODE]
```

Please perform deep root-cause analysis, identify the exact bug, and provide the complete fixed code block.
```

---

## ⚙️ Best Practices & Troubleshooting

1. **Keep Server Running**: Keep `deepseek -s 4040` running in a dedicated terminal or launch it as a background task.
2. **Token Economy**: Reserve frontier models (Gemini Pro, Claude Opus) for architectural planning, user interactions, and final code reviews. Offload boilerplate, bulk writing, and algorithmic code to DeepSeek.
3. **Auto-Start Feature**: The helper CLI (`call`) will automatically test the `/health` endpoint and attempt to spin up the local gateway server if not already active.
