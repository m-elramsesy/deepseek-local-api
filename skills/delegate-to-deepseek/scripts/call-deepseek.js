#!/usr/bin/env node

/**
 * Helper script to query the local DeepSeek OpenAI-compatible gateway.
 * Zero external dependencies beyond Node.js built-in fetch.
 * 
 * Usage:
 *   node call-deepseek.js --prompt "Write a JavaScript utility to debounce"
 *   node call-deepseek.js --file ./path/to/prompt.txt --model deepseek-reasoner
 *   node call-deepseek.js --port 4040 --json
 */

const fs = require('fs');

function parseArgs(args) {
    const params = {
        prompt: '',
        file: '',
        model: 'deepseek-chat',
        port: process.env.DEEPSEEK_PORT || 4040,
        host: '127.0.0.1',
        stream: false,
        json: false,
        thinking: false
    };

    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        if (arg === '--prompt' || arg === '-p') {
            params.prompt = args[++i];
        } else if (arg === '--file' || arg === '-f') {
            params.file = args[++i];
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
        }
    }
    return params;
}

async function main() {
    const params = parseArgs(process.argv.slice(2));

    let promptText = params.prompt;
    if (params.file) {
        if (!fs.existsSync(params.file)) {
            console.error(`Error: File not found: ${params.file}`);
            process.exit(1);
        }
        promptText = fs.readFileSync(params.file, 'utf8');
    }

    if (!promptText) {
        // Check stdin
        if (!process.stdin.isTTY) {
            try {
                promptText = fs.readFileSync(0, 'utf-8');
            } catch (e) {}
        }
    }

    if (!promptText || !promptText.trim()) {
        console.error('Error: Prompt is required. Provide via --prompt, --file, or stdin.');
        process.exit(1);
    }

    const payload = {
        model: params.model,
        messages: [
            { role: 'user', content: promptText.trim() }
        ],
        stream: params.stream,
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

        if (params.stream) {
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
            } else {
                const content = data.choices?.[0]?.message?.content || '';
                const reasoning = data.choices?.[0]?.message?.reasoning_content;
                if (reasoning) {
                    console.error('[DeepSeek Reasoning]:\n' + reasoning + '\n');
                }
                console.log(content);
            }
        }
    } catch (err) {
        console.error(`Failed to connect to local gateway on port ${params.port}: ${err.message}`);
        console.error('Ensure deepseek-local-api server is running: node bin/cli.js -s 4040');
        process.exit(1);
    }
}

main();
