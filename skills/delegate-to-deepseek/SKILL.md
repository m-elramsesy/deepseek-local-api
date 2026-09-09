---
name: delegate-to-deepseek
description: Delegate heavy coding, full-file generation, architectural design, deep debugging, and code analysis to a local DeepSeek instance via deepseek-local-api gateway or CLI. DeepSeek acts as the pure-text reasoning brain, while the host harness executes the tool actions (file creation, edits, command execution).
license: MIT
metadata:
  version: "1.0.0"
  author: "m-elramsesy"
  compatibility: "Works with any agent harness (Hermes, Claude Code, Antigravity, OpenCode, Cursor, Continue) that possesses file and command tools."
  tags: "deepseek, local-api, code-generation, delegation, reasoning, code-analysis, harness"
---

# Delegate to DeepSeek (Text-to-Tools Bridge)

Use this skill whenever you need to offload complex coding, complete file generation, architectural design, or in-depth code analysis to a local DeepSeek instance powered by **`deepseek-local-api`**.

---

## 🧠 Core Philosophy: The Brain & Hands Architecture

When working with `deepseek-local-api`:

| Role | Entity | Responsibilities | Capabilities & Constraints |
| :--- | :--- | :--- | :--- |
| **The Brain** | **DeepSeek (Local API / CLI)** | Pure text generation, R1 deep chain-of-thought, production-grade code synthesis, comprehensive file review. | **Pure Text In / Pure Text Out**. DeepSeek does **NOT** have direct disk access, terminal access, or local tool calling. |
| **The Hands** | **The Host Harness (Hermes / Agent)** | Context gathering, sending prompts to gateway, reading file contents, executing tool actions. | **Full Tool Access**. The harness has `write_to_file`, `replace_file_content`, `run_command`, workspace search, and terminal control. |

```
┌────────────────────────────────────────────────────────┐
│               Host Harness (Hermes / Agent)            │
│  - Reads local files & user requirements               │
│  - Packages pure-text prompt                           │
└──────────────────────────┬─────────────────────────────┘
                           │ 1. HTTP POST or CLI (Pure Text)
                           ▼
┌────────────────────────────────────────────────────────┐
│            Local DeepSeek Gateway / CLI                │
│             (chat.deepseek.com bridge)                 │
│  - Deep reasoning (R1 / V3)                            │
│  - Synthesizes 100% complete code & solutions          │
└──────────────────────────┬─────────────────────────────┘
                           │ 2. Returns Generated Code (Pure Text)
                           ▼
┌────────────────────────────────────────────────────────┐
│               Host Harness (Hermes / Agent)            │
│  - Extracts code blocks & file paths                   │
│  - Invokes native tools: write_to_file, run_command    │
│  - Creates/modifies files on disk / Desktop            │
└────────────────────────────────────────────────────────┘
```

The bridge between the harness and DeepSeek is **strictly text**. DeepSeek creates the exact, complete code as text; the harness uses its native tools to bring that code to life in the filesystem.

---

## 🎯 When to Trigger This Skill

Activate this workflow when:
1. **Generating New Code Files**: The user asks for a complete JavaScript, TypeScript, Python, HTML, CSS, or backend module.
2. **Deep Code Analysis / Review**: The user wants an in-depth code review, security audit, or architectural critique of an entire file.
3. **Heavy Algorithmic / Complex Logic**: Complex data structures, regex, mathematical algorithms, or intricate state machines.
4. **Refactoring Large Files**: Restructuring legacy files while preserving all existing logic and APIs without truncation.
5. **Hard-to-Track Bugs**: Passing error logs, stack traces, and relevant file contents to DeepSeek R1 for root-cause diagnosis.

---

## 🛠️ Step-by-Step Harness Execution Workflow

### Step 1: Context Aggregation (Harness Tool Call)
Before contacting DeepSeek, the harness collects all necessary context using its own tools:
- Read existing target files (`view_file` or `cat`).
- Inspect project configuration (`package.json`, `tsconfig.json`).
- Gather error logs, stack traces, or dependency lists.

### Step 2: Query Local DeepSeek Gateway

The harness transmits the packaged prompt to the local gateway using one of the standard methods:

#### Method A: HTTP Request to OpenAI-Compatible Gateway (Recommended)
Default endpoints: `http://127.0.0.1:4040/v1` or `http://127.0.0.1:3000/v1`

**Curl Example:**
```bash
curl -s http://127.0.0.1:4040/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "deepseek-chat",
    "messages": [
      {
        "role": "system",
        "content": "You are DeepSeek. Output full, complete, production-ready code with no abbreviations or omitted sections. Place each file inside a markdown code block with the target file path labeled on the preceding line (e.g. ### File: path/to/file.js)."
      },
      {
        "role": "user",
        "content": "Create an Express.js rate limiter middleware with in-memory sliding window."
      }
    ]
  }'
```

*Tip*: Use model `deepseek-reasoner` to enable DeepSeek R1 reasoning chain for complex debugging or architecture problems.

#### Method B: Built-in Helper Script
Use the bundled zero-dependency Node script:
```bash
node skills/delegate-to-deepseek/scripts/call-deepseek.js \
  --port 4040 \
  --prompt "Write a JavaScript debounce and throttle utility file with full TypeScript types."
```

Or pass a context file:
```bash
node skills/delegate-to-deepseek/scripts/call-deepseek.js \
  --port 4040 \
  --file ./src/legacy-module.js \
  --prompt "Refactor this module to use modern async/await and ES modules."
```

#### Method C: CLI Shortcut
```bash
deepseek "Create a standalone WebSocket server script in Node.js"
# or
npx @ramsesy/deepseek-local-api "Your prompt here"
```

---

### Step 3: Parse Output & Extract Code
The harness receives DeepSeek's pure-text response.
- Locate the code blocks (e.g. ````javascript ... ````).
- Identify target file destination (e.g. `./src/utils/rateLimiter.js` or `Desktop/script.js`).
- Verify that the code is complete and free of placeholder comments like `// ... rest of implementation`.

---

### Step 4: Tool Execution (Harness Actions)
The harness uses its own toolset to apply the changes:
1. **Writing the File**: Invoke `write_to_file` (or `create_file` / shell redirection) to write the code directly to disk.
2. **Syntax & Test Validation**: Invoke `run_command` to execute syntax checks or tests (e.g. `node -c <file>` or `npm test`).
3. **Surgical Edits**: If updating existing code, use `replace_file_content` to apply the exact diffs provided by DeepSeek.

---

## 📋 Recommended Prompting Templates for the Harness

### 1. New File Generation Prompt
```text
Task: Create a new file at: [TARGET_FILE_PATH]

Requirements:
[DETAILED USER REQUIREMENTS]

Rules for output:
1. Provide the 100% COMPLETE code for this file. DO NOT truncate or leave placeholders.
2. Format as a single markdown code block with language specifier.
3. Ensure all imports, exports, type definitions, and error handling are fully implemented.
```

### 2. File Analysis & Refactoring Prompt
```text
Task: Analyze and refactor the following existing file.

Target File: [TARGET_FILE_PATH]
Current Content:
```[LANGUAGE]
[PASTE CURRENT FILE CONTENT HERE]
```

Goal:
[USER REQUEST: e.g., fix memory leak, optimize performance, add feature X]

Rules for output:
1. Explain the diagnosis or architectural changes concisely.
2. Output the complete updated file code block so the harness can overwrite or patch it directly.
```

### 3. Deep Bug Diagnosis (R1 Reasoner)
```text
Model: deepseek-reasoner
Prompt:
We encountered the following runtime error:
[PASTE ERROR LOG / STACK TRACE]

Relevant source code:
```[LANGUAGE]
[PASTE SOURCE CODE]
```

Please perform deep root-cause analysis, identify the exact bug, and provide the fixed code block.
```

---

## ⚙️ Best Practices & Guardrails

1. **Verify Gateway Status**:
   If the harness cannot connect to `http://127.0.0.1:4040/v1` or `3000/v1`, ensure the local server is started:
   ```bash
   node bin/cli.js -s 4040
   ```
2. **Preserve Complete Files**:
   DeepSeek Web has a large context window. Always instruct DeepSeek to return full file implementations rather than partial diffs when creating new files, so the harness can execute a clean `write_to_file` call without hallucinating missing parts.
3. **Let the Harness Handle the OS**:
   Never ask DeepSeek to execute OS commands or file writes directly. Keep DeepSeek focused entirely on reasoning and code synthesis, while the harness executes all filesystem and terminal operations.
