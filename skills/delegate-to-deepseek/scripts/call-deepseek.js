#!/usr/bin/env node

/**
 * Helper script to query the local DeepSeek OpenAI-compatible gateway.
 * Zero external dependencies beyond Node.js built-in fetch and child_process.
 * 
 * Features:
 *   - Auto-health check: Verifies gateway server is alive.
 *   - Auto-start: Can spawn local gateway if not already running.
 *   - Direct file output: Saves extracted code directly to -o/--output file.
 *   - Pure token savings: Offloads heavy code generation to local DeepSeek.
 * 
 * Usage:
 *   deepseek call -p "Write an Express auth middleware" -o src/auth.js
 *   node call-deepseek.js --prompt "Write a debounce function" -o debounce.js
 */

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

function parseArgs(args) {
    const params = {
        prompt: '',
        file: '',
        output: '',
        model: 'deepseek-chat',
        port: parseInt(process.env.DEEPSEEK_PORT || '4040', 10),
        host: '127.0.0.1',
        stream: false,
        json: false,
        thinking: false,
        raw: false,
        autoStart: true
    };

    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        if (arg === '--prompt' || arg === '-p') {
            params.prompt = args[++i];
        } else if (arg === '--file' || arg === '-f') {
            params.file = args[++i];
        } else if (arg === '--output' || arg === '-o') {
            params.output = args[++i];
        } else if (arg === '--model' || arg === '-m') {
            params.model = args[++i];
        } else if (arg === '--port') {
            params.port = parseInt(args[++i], 10);
        } else if (arg === '--host') {
            params.host = args[++i];
        } else if (arg === '--stream' || arg === '-s') {
            params.stream = true;
        } else if (arg === '--json') {
            params.json = true;
        } else if (arg === '--thinking' || arg === '-t') {
            params.thinking = true;
        } else if (arg === '--raw' || arg === '-r') {
            params.raw = true;
        } else if (arg === '--no-auto-start') {
            params.autoStart = false;
        } else if (!arg.startsWith('-') && !params.prompt) {
            params.prompt = arg;
        }
    }
    return params;
}

/**
 * Check if the gateway server is healthy
 */
async function checkHealth(host, port) {
    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 1200);
        const res = await fetch(`http://${host}:${port}/health`, { signal: controller.signal });
        clearTimeout(timeout);
        return res.ok;
    } catch (e) {
        return false;
    }
}

/**
 * Find local cli.js path if installed locally or in package
 */
function findCliPath() {
    const candidates = [
        path.resolve(__dirname, '../../../bin/cli.js'),
        path.resolve(__dirname, '../../bin/cli.js'),
        path.resolve(__dirname, '../bin/cli.js')
    ];
    for (const c of candidates) {
        if (fs.existsSync(c)) return c;
    }
    return null;
}

/**
 * Ensure gateway server is running, auto-starting if enabled
 */
async function ensureServerRunning(host, port, autoStart) {
    const isUp = await checkHealth(host, port);
    if (isUp) return true;

    if (!autoStart) {
        console.error(`[Error] DeepSeek gateway server is not responding on http://${host}:${port}`);
        console.error(`Start the server first using: deepseek -s ${port} (or npx @ramsesy/deepseek-local-api -s ${port})`);
        return false;
    }

    console.log(`[DeepSeek Bridge] Gateway server on port ${port} is not running. Attempting auto-start...`);
    const cliPath = findCliPath();
    let child;

    if (cliPath) {
        child = spawn(process.execPath, [cliPath, '-s', String(port)], {
            detached: true,
            stdio: 'ignore'
        });
    } else {
        // Fallback: spawn npx in background
        const cmd = process.platform === 'win32' ? 'npx.cmd' : 'npx';
        child = spawn(cmd, ['@ramsesy/deepseek-local-api', '-s', String(port)], {
            detached: true,
            stdio: 'ignore'
        });
    }

    if (child && child.unref) {
        child.unref();
    }

    // Wait up to 5 seconds for health check to pass
    for (let attempt = 0; attempt < 10; attempt++) {
        await new Promise(r => setTimeout(r, 500));
        if (await checkHealth(host, port)) {
            console.log(`[DeepSeek Bridge] Server ready on http://${host}:${port}`);
            return true;
        }
    }

    console.error(`[Error] Timed out waiting for gateway server on port ${port}.`);
    console.error(`Please start the server manually in another terminal: deepseek -s ${port}`);
    return false;
}

/**
 * Extract code block from markdown response
 */
function extractCodeBlock(markdownText) {
    if (!markdownText) return '';
    const codeBlockRegex = /```(?:[a-zA-Z0-9_\-+]*\n)?([\s\S]*?)```/;
    const match = markdownText.match(codeBlockRegex);
    if (match && match[1]) {
        return match[1].trim();
    }
    return markdownText.trim();
}

async function callDeepseek(rawArgs) {
    const params = parseArgs(rawArgs);

    let promptText = params.prompt;
    if (params.file) {
        if (!fs.existsSync(params.file)) {
            console.error(`Error: Context file not found: ${params.file}`);
            process.exit(1);
        }
        promptText = fs.readFileSync(params.file, 'utf8');
    }

    if (!promptText && !process.stdin.isTTY) {
        try {
            const stat = fs.fstatSync(0);
            if (stat && (stat.size > 0 || stat.isFIFO())) {
                promptText = fs.readFileSync(0, 'utf-8');
            }
        } catch (e) {}
    }

    if (!promptText || !promptText.trim()) {
        console.error('Error: Prompt is required. Provide via --prompt (-p), --file (-f), or stdin.');
        process.exit(1);
    }

    const isRunning = await ensureServerRunning(params.host, params.port, params.autoStart);
    if (!isRunning) {
        process.exit(1);
    }

    const payload = {
        model: params.model,
        messages: [
            {
                role: 'system',
                content: 'You are DeepSeek. Output clean, complete, production-grade code. If code is requested, provide the entire file content with zero omissions, placeholders, or ellipsis.'
            },
            { role: 'user', content: promptText.trim() }
        ],
        stream: params.stream && !params.output,
        thinking_enabled: params.thinking || params.model.includes('reasoner')
    };

    const url = `http://${params.host}:${params.port}/v1/chat/completions`;

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errText = await response.text();
            console.error(`HTTP Error ${response.status} from gateway: ${errText}`);
            process.exit(1);
        }

        if (payload.stream) {
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop();

                for (const line of lines) {
                    const trimmed = line.trim();
                    if (!trimmed || !trimmed.startsWith('data:')) continue;
                    const dataStr = trimmed.slice(5).trim();
                    if (dataStr === '[DONE]') continue;
                    try {
                        const parsed = JSON.parse(dataStr);
                        const delta = parsed.choices?.[0]?.delta;
                        if (delta?.content) {
                            process.stdout.write(delta.content);
                        }
                    } catch (e) {}
                }
            }
            process.stdout.write('\n');
        } else {
            const data = await response.json();
            if (params.json) {
                console.log(JSON.stringify(data, null, 2));
                return;
            }

            const content = data.choices?.[0]?.message?.content || '';
            const reasoning = data.choices?.[0]?.message?.reasoning_content;

            if (reasoning && !params.raw && !params.output) {
                console.error('[DeepSeek Reasoning]:\n' + reasoning + '\n');
            }

            if (params.output) {
                const cleanCode = extractCodeBlock(content);
                const outPath = path.resolve(process.cwd(), params.output);
                fs.mkdirSync(path.dirname(outPath), { recursive: true });
                fs.writeFileSync(outPath, cleanCode, 'utf8');
                console.log(`\x1b[32m✓ Successfully written generated code to: ${params.output}\x1b[0m`);
            } else {
                if (params.raw) {
                    process.stdout.write(extractCodeBlock(content));
                } else {
                    console.log(content);
                }
            }
        }
    } catch (err) {
        console.error(`Failed to connect to local gateway on port ${params.port}: ${err.message}`);
        console.error(`Ensure deepseek-local-api server is running: deepseek -s ${params.port}`);
        process.exit(1);
    }
}

module.exports = { callDeepseek, parseArgs };

if (require.main === module) {
    callDeepseek(process.argv.slice(2));
}
