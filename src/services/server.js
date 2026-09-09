const http = require('http');
const os = require('os');
const path = require('path');
const DeepseekClient = require('../client/DeepseekClient');

/**
 * Retrieve the local network IPv4 address for display when network access is enabled
 */
function getLocalNetworkIp() {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            if (iface.family === 'IPv4' && !iface.internal) {
                return iface.address;
            }
        }
    }
    return '127.0.0.1';
}

/**
 * Safely parse JSON request body with size limitation
 */
function parseJsonBody(req) {
    return new Promise((resolve, reject) => {
        let body = '';
        req.on('data', (chunk) => {
            body += chunk;
            if (body.length > 10 * 1024 * 1024) { // 10MB limit
                req.destroy();
                reject(new Error('Payload too large'));
            }
        });
        req.on('end', () => {
            if (!body.trim()) return resolve({});
            try {
                resolve(JSON.parse(body));
            } catch (e) {
                reject(new Error('Invalid JSON: ' + e.message));
            }
        });
        req.on('error', reject);
    });
}

/**
 * Attach CORS headers to response
 */
function setCorsHeaders(res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
}

/**
 * Safely extract text from message content (supports string, array of parts, or object)
 */
function extractContentText(content) {
    if (!content) return '';
    if (typeof content === 'string') return content;
    if (Array.isArray(content)) {
        return content
            .map(part => {
                if (typeof part === 'string') return part;
                if (part && typeof part === 'object') {
                    return part.text || part.content || '';
                }
                return '';
            })
            .filter(Boolean)
            .join('\n');
    }
    if (typeof content === 'object') {
        return content.text || content.content || JSON.stringify(content);
    }
    return String(content);
}

/**
 * Normalize and resolve file path for local OS (replaces $HOME, ~, %USERPROFILE%, and generic desktop placeholders)
 */
function normalizeFilePath(rawPath) {
    if (!rawPath || typeof rawPath !== 'string') return '';
    let p = rawPath.trim()
        .replace(/^["']|["']$/g, '')
        .replace(/\$HOME|~/g, os.homedir())
        .replace(/%USERPROFILE%/g, os.homedir());

    // If path targets Desktop under a generic or guessed Users path
    const desktopRegex = /^[a-zA-Z]:[/\\]Users[/\\](?:User|username|admin|Public|your_username|<username>|user)[/\\]Desktop([/\\][\s\S]*)?$/i;
    const dMatch = p.match(desktopRegex);
    if (dMatch) {
        const sub = (dMatch[1] || '').replace(/^[/\\]+/, '');
        p = path.join(os.homedir(), 'Desktop', sub);
    }

    try {
        return path.normalize(p);
    } catch (e) {
        return p;
    }
}

/**
 * Convert OpenAI messages array into a prompt for DeepSeek
 */
function formatMessagesToPrompt(messages) {
    if (typeof messages === 'string') return messages;
    if (!Array.isArray(messages) || messages.length === 0) return '';

    if (messages.length === 1 && !messages[0].tool_calls) {
        return extractContentText(messages[0].content);
    }

    const parts = [];
    for (const msg of messages) {
        const role = msg.role || 'user';
        const content = extractContentText(msg.content);

        let toolCallDesc = '';
        if (msg.tool_calls && Array.isArray(msg.tool_calls)) {
            const calls = msg.tool_calls.map(tc => {
                const name = tc.function ? tc.function.name : tc.name;
                const args = tc.function ? tc.function.arguments : tc.arguments;
                return `<tool_call>\n{"name": "${name}", "arguments": ${typeof args === 'string' ? args : JSON.stringify(args)}}\n</tool_call>`;
            }).join('\n');
            toolCallDesc = '\n' + calls;
        }

        if (role === 'system') {
            if (content) parts.push(`[System]: ${content}`);
        } else if (role === 'user') {
            if (content) parts.push(`User: ${content}`);
        } else if (role === 'assistant') {
            const fullAssistant = (content ? content : '') + toolCallDesc;
            if (fullAssistant.trim()) {
                parts.push(`Assistant: ${fullAssistant.trim()}`);
            }
        } else if (role === 'tool') {
            parts.push(`[Tool Result (${msg.name || 'tool'})]: ${content}`);
        } else {
            if (content) parts.push(`${role}: ${content}`);
        }
    }
    return parts.join('\n\n');
}

/**
 * Format OpenAI tools array into prompt instructions for DeepSeek
 */
function formatToolsPrompt(tools) {
    if (!Array.isArray(tools) || tools.length === 0) return '';
    const toolList = [];
    for (const t of tools) {
        const fn = t.function || t;
        if (!fn || !fn.name) continue;
        let desc = fn.description || '';
        if (desc.length > 250) desc = desc.substring(0, 250) + '...';
        const params = fn.parameters ? JSON.stringify(fn.parameters) : '{}';
        toolList.push(`- ${fn.name}: ${desc}\n  Parameters schema: ${params}`);
    }
    if (toolList.length === 0) return '';

    const desktopPath = path.join(os.homedir(), 'Desktop');

    return `\n\n[SYSTEM: LOCAL AGENT ENVIRONMENT & AVAILABLE TOOLS]
Environment context:
- Operating System: ${os.platform()} (${os.type()})
- User Home: ${os.homedir()}
- User Desktop: ${desktopPath}
- Current Working Directory: ${process.cwd()}

Available Tools:
${toolList.join('\n')}

CRITICAL INSTRUCTION FOR ACTIONS:
When the user asks you to perform an action (e.g. creating/writing files, executing shell commands, searching files, etc.):
You MUST invoke the appropriate tool! Do NOT merely show the code or command in a conversational markdown block.
To call a tool, you MUST output an exact XML block:
<tool_call>
{"name": "tool_name", "arguments": {"param1": "val1"}}
</tool_call>

Example to write/create a file:
<tool_call>
{"name": "write_file", "arguments": {"path": "${desktopPath.replace(/\\/g, '\\\\')}\\\\demo.txt", "content": "Line 1: Hello World\\nLine 2: Demo"}}
</tool_call>

Example to execute a shell command:
<tool_call>
{"name": "terminal", "arguments": {"command": "npm install"}}
</tool_call>

You may include a brief conversational sentence before the <tool_call>. Always invoke the tool so the agent harness can execute the action!`;
}

/**
 * Parse tool calls from DeepSeek output text
 */
function parseToolCalls(text, availableTools) {
    if (!availableTools || !Array.isArray(availableTools) || availableTools.length === 0) {
        return { cleanText: text, toolCalls: [] };
    }

    const toolsMap = new Set(availableTools.map(t => (t.function && t.function.name) || t.name));
    const toolCalls = [];
    let cleanText = text;

    // 1. Explicit <tool_call> or ```tool_call
    const tagRegex = /<tool_call>([\s\S]*?)<\/tool_call>|```(?:tool_call|json:tool_call)\n([\s\S]*?)```/gi;
    let match;
    while ((match = tagRegex.exec(text)) !== null) {
        let rawJson = (match[1] || match[2] || '').trim();
        let parsed = null;
        try {
            parsed = JSON.parse(rawJson);
        } catch (e) {
            // Try auto-balancing braces
            let open = (rawJson.match(/{/g) || []).length;
            let close = (rawJson.match(/}/g) || []).length;
            if (open > close) {
                try {
                    parsed = JSON.parse(rawJson + '}'.repeat(open - close));
                } catch (e2) {}
            }
        }

        if (!parsed) {
            // Regex fallback for name and arguments
            const nameMatch = rawJson.match(/"name"\s*:\s*"([^"]+)"/i);
            const argsMatch = rawJson.match(/"arguments"\s*:\s*({[\s\S]*)/i);
            if (nameMatch) {
                const toolName = nameMatch[1];
                let toolArgs = {};
                if (argsMatch) {
                    let argStr = argsMatch[1].trim();
                    let aOpen = (argStr.match(/{/g) || []).length;
                    let aClose = (argStr.match(/}/g) || []).length;
                    if (aOpen > aClose) argStr += '}'.repeat(aOpen - aClose);
                    try { toolArgs = JSON.parse(argStr); } catch (e3) {}
                }
                parsed = { name: toolName, arguments: toolArgs };
            }
        }

        if (parsed && parsed.name && toolsMap.has(parsed.name)) {
            let args = parsed.arguments || {};
            if (typeof args === 'string') {
                try { args = JSON.parse(args); } catch (e) {}
            }
            if (args && typeof args === 'object' && args.path && typeof args.path === 'string') {
                args.path = normalizeFilePath(args.path);
            }

            toolCalls.push({
                id: 'call_' + Math.random().toString(36).substring(2, 10),
                type: 'function',
                function: {
                    name: parsed.name,
                    arguments: typeof args === 'string' ? args : JSON.stringify(args)
                }
            });
            cleanText = cleanText.replace(match[0], '').trim();
        }
    }

    if (toolCalls.length > 0) return { cleanText, toolCalls };

    // 2. Fallback: cat << 'EOF' > path ... EOF
    const catRegex = /cat\s*<<\s*['"]?(\w+)['"]?\s*>\s*["']?([^"'\n\r]+)["']?\n([\s\S]*?)\n\s*\1/i;
    const catMatch = text.match(catRegex);
    if (catMatch && toolsMap.has('write_file')) {
        const filePath = normalizeFilePath(catMatch[2]);
        const content = catMatch[3];
        toolCalls.push({
            id: 'call_' + Math.random().toString(36).substring(2, 10),
            type: 'function',
            function: {
                name: 'write_file',
                arguments: JSON.stringify({ path: filePath, content })
            }
        });
        cleanText = text.replace(/```[\s\S]*?```/g, '').trim();
        return { cleanText, toolCalls };
    }

    // 3. Fallback: echo "content" > "path"
    const echoRegex = /echo\s+["']([\s\S]*?)["']\s*>\s*["']?([^"'\n\r]+)["']?/i;
    const echoMatch = text.match(echoRegex);
    if (echoMatch && toolsMap.has('write_file')) {
        const content = echoMatch[1];
        const filePath = normalizeFilePath(echoMatch[2]);
        toolCalls.push({
            id: 'call_' + Math.random().toString(36).substring(2, 10),
            type: 'function',
            function: {
                name: 'write_file',
                arguments: JSON.stringify({ path: filePath, content })
            }
        });
        cleanText = text.replace(/```[\s\S]*?```/g, '').trim();
        return { cleanText, toolCalls };
    }

    // 4. Fallback: Shell command block when terminal tool is available
    if (toolsMap.has('terminal')) {
        const cmdBlockRegex = /```(?:bash|sh|cmd|powershell)?\s*\n([\s\S]*?)\n```/i;
        const cmdMatch = text.match(cmdBlockRegex);
        if (cmdMatch && cmdMatch[1]) {
            const cmd = cmdMatch[1].trim();
            if (cmd.startsWith('echo ') || cmd.startsWith('mkdir ') || cmd.startsWith('touch ') || cmd.startsWith('New-Item ') || cmd.startsWith('git ')) {
                toolCalls.push({
                    id: 'call_' + Math.random().toString(36).substring(2, 10),
                    type: 'function',
                    function: {
                        name: 'terminal',
                        arguments: JSON.stringify({ command: cmd })
                    }
                });
                cleanText = text.replace(cmdMatch[0], '').trim();
                return { cleanText, toolCalls };
            }
        }
    }

    return { cleanText, toolCalls };
}

/**
 * Start OpenAI-compatible HTTP server
 * @param {Object} options
 * @param {string} options.token - DeepSeek token
 * @param {number} [options.port=3000] - Port number to listen on
 * @param {boolean} [options.isNetworkAvailable=false] - True to bind 0.0.0.0 (LAN access), false for 127.0.0.1 (localhost only)
 * @returns {Promise<http.Server>}
 */
async function startServer({ token, port = 3000, isNetworkAvailable = false }) {
    if (!token) {
        throw new Error('DEEPSEEK_TOKEN is strictly required to start the local server.');
    }
    const defaultClient = new DeepseekClient(token);
    process.stdout.write('Initializing DeepSeek client & WASM solver for local server... ');
    await defaultClient.initialize();
    console.log('Done.\n');

    const host = isNetworkAvailable ? '0.0.0.0' : '127.0.0.1';

    const server = http.createServer(async (req, res) => {
        setCorsHeaders(res);

        // Handle CORS preflight
        if (req.method === 'OPTIONS') {
            res.writeHead(204);
            res.end();
            return;
        }

        const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
        const pathname = parsedUrl.pathname.replace(/\/+$/, '') || '/';

        // Health check endpoint
        if (req.method === 'GET' && (pathname === '/' || pathname === '/health')) {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ status: 'ok', service: 'deepseek-local-api' }));
            return;
        }

        // OpenAI Models endpoint
        if (req.method === 'GET' && (pathname === '/v1/models' || pathname === '/models')) {
            const models = {
                object: 'list',
                data: [
                    { id: 'deepseek-chat', object: 'model', created: 1700000000, owned_by: 'deepseek' },
                    { id: 'deepseek-reasoner', object: 'model', created: 1700000000, owned_by: 'deepseek' }
                ]
            };
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(models));
            return;
        }

        // OpenAI Chat Completions endpoint
        if (req.method === 'POST' && (pathname === '/v1/chat/completions' || pathname === '/chat/completions')) {
            try {
                // Determine token: prefer server default token if set
                const authHeader = req.headers['authorization'] || '';
                const defaultToken = (token || process.env.DEEPSEEK_TOKEN || '').trim().replace(/^["']|["']$/g, '');
                let requestToken = defaultToken;

                if (authHeader.startsWith('Bearer ')) {
                    const bearer = authHeader.slice(7).trim().replace(/^["']|["']$/g, '');
                    const isPlaceholder = !bearer ||
                        ['null', 'undefined', 'none', 'dummy', 'test', 'default', 'placeholder', 'no-key', 'empty', 'hermes'].includes(bearer.toLowerCase()) ||
                        bearer.toLowerCase().startsWith('sk-') ||
                        bearer.toLowerCase().startsWith('hermes') ||
                        (defaultToken && bearer.length !== defaultToken.length);

                    if (!isPlaceholder && bearer.length >= 60) {
                        // Incoming Bearer looks like a genuine custom 64-char DeepSeek web token
                        requestToken = bearer;
                    } else {
                        // Keep server-configured default token!
                        requestToken = defaultToken || bearer;
                    }
                }

                if (!requestToken) {
                    res.writeHead(401, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({
                        error: {
                            message: 'Authentication required: Please provide your DeepSeek token via "Authorization: Bearer <token>" header or set DEEPSEEK_TOKEN in environment/.env.',
                            type: 'authentication_error',
                            code: 'invalid_api_key'
                        }
                    }));
                    return;
                }

                const body = await parseJsonBody(req);
                const model = body.model || 'deepseek-chat';
                const stream = Boolean(body.stream);
                const isReasoner = model.includes('reasoner') || model.includes('r1');
                const thinking_enabled = body.thinking_enabled !== undefined ? body.thinking_enabled : isReasoner;
                const search_enabled = Boolean(body.search_enabled);

                console.log(`[Request] ${req.method} ${pathname} | Model: ${model} | Stream: ${stream} | Token: ${requestToken === defaultToken ? 'Default (.env)' : 'Client Bearer'}`);

                let prompt = formatMessagesToPrompt(body.messages || body.prompt);
                if (!prompt) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: { message: 'Missing messages or prompt in request body', type: 'invalid_request_error' } }));
                    return;
                }

                // If client provided tools, inject tool execution guide into prompt
                const hasTools = Boolean(body.tools && Array.isArray(body.tools) && body.tools.length > 0);
                if (hasTools) {
                    prompt += formatToolsPrompt(body.tools);
                }

                // Create client using active token, sharing the already-initialized WASM solver
                let activeClient = (requestToken === defaultToken) ? defaultClient : new DeepseekClient(requestToken);
                activeClient.powService.wasmService = defaultClient.powService.wasmService;

                // Create a fresh session and send message, with auto-fallback to defaultClient
                let session;
                let completionResponse;
                try {
                    session = await activeClient.createSession();
                    completionResponse = await activeClient.sendMessage(prompt, session, {
                        thinking_enabled,
                        search_enabled
                    });
                } catch (sendErr) {
                    if (defaultToken && activeClient !== defaultClient && sendErr.message && sendErr.message.includes('40003')) {
                        console.warn('\x1b[33m⚠️  [Hermes Fallback] Client Authorization token failed (40003: invalid token). Automatically falling back to server DEEPSEEK_TOKEN from .env.\x1b[0m');
                        activeClient = defaultClient;
                        requestToken = defaultToken;
                        session = await activeClient.createSession();
                        completionResponse = await activeClient.sendMessage(prompt, session, {
                            thinking_enabled,
                            search_enabled
                        });
                    } else {
                        throw sendErr;
                    }
                }

                const completionId = 'chatcmpl-' + Math.random().toString(36).substring(2, 15);
                const createdTime = Math.floor(Date.now() / 1000);

                if (stream) {
                    res.writeHead(200, {
                        'Content-Type': 'text/event-stream; charset=utf-8',
                        'Cache-Control': 'no-cache, no-transform',
                        'Connection': 'keep-alive',
                        'X-Accel-Buffering': 'no'
                    });

                    if (!hasTools) {
                        // Standard real-time streaming when no tools are requested
                        for await (const chunk of activeClient.streamResponse(completionResponse, session)) {
                            const delta = {};
                            if (chunk.type === 'thinking') {
                                delta.reasoning_content = chunk.text;
                            } else if (chunk.type === 'content') {
                                delta.content = chunk.text;
                            }

                            const chunkPayload = {
                                id: completionId,
                                object: 'chat.completion.chunk',
                                created: createdTime,
                                model: model,
                                choices: [
                                    {
                                        index: 0,
                                        delta: delta,
                                        finish_reason: null
                                    }
                                ]
                            };
                            res.write(`data: ${JSON.stringify(chunkPayload)}\n\n`);
                        }

                        // Final finish_reason chunk
                        const stopPayload = {
                            id: completionId,
                            object: 'chat.completion.chunk',
                            created: createdTime,
                            model: model,
                            choices: [
                                {
                                    index: 0,
                                    delta: {},
                                    finish_reason: 'stop'
                                }
                            ]
                        };
                        res.write(`data: ${JSON.stringify(stopPayload)}\n\n`);
                    } else {
                        // Tool-aware streaming: stream reasoning in real time, buffer content to detect and emit tool_calls
                        let fullContent = '';
                        for await (const chunk of activeClient.streamResponse(completionResponse, session)) {
                            if (chunk.type === 'thinking') {
                                const thinkPayload = {
                                    id: completionId,
                                    object: 'chat.completion.chunk',
                                    created: createdTime,
                                    model: model,
                                    choices: [
                                        {
                                            index: 0,
                                            delta: { reasoning_content: chunk.text },
                                            finish_reason: null
                                        }
                                    ]
                                };
                                res.write(`data: ${JSON.stringify(thinkPayload)}\n\n`);
                            } else if (chunk.type === 'content') {
                                fullContent += chunk.text;
                            }
                        }

                        const { cleanText, toolCalls } = parseToolCalls(fullContent, body.tools);
                        if (toolCalls.length > 0) {
                            console.log(`\x1b[32m[Tool Call Detected]\x1b[0m Emitting ${toolCalls.length} tool call(s) to harness: ${toolCalls.map(t => t.function.name).join(', ')}`);
                            if (cleanText) {
                                res.write(`data: ${JSON.stringify({
                                    id: completionId,
                                    object: 'chat.completion.chunk',
                                    created: createdTime,
                                    model: model,
                                    choices: [{ index: 0, delta: { content: cleanText }, finish_reason: null }]
                                })}\n\n`);
                            }

                            for (let i = 0; i < toolCalls.length; i++) {
                                const tc = toolCalls[i];
                                res.write(`data: ${JSON.stringify({
                                    id: completionId,
                                    object: 'chat.completion.chunk',
                                    created: createdTime,
                                    model: model,
                                    choices: [
                                        {
                                            index: 0,
                                            delta: {
                                                tool_calls: [
                                                    {
                                                        index: i,
                                                        id: tc.id,
                                                        type: 'function',
                                                        function: {
                                                            name: tc.function.name,
                                                            arguments: tc.function.arguments
                                                        }
                                                    }
                                                ]
                                            },
                                            finish_reason: null
                                        }
                                    ]
                                })}\n\n`);
                            }

                            res.write(`data: ${JSON.stringify({
                                id: completionId,
                                object: 'chat.completion.chunk',
                                created: createdTime,
                                model: model,
                                choices: [{ index: 0, delta: {}, finish_reason: 'tool_calls' }]
                            })}\n\n`);
                        } else {
                            res.write(`data: ${JSON.stringify({
                                id: completionId,
                                object: 'chat.completion.chunk',
                                created: createdTime,
                                model: model,
                                choices: [{ index: 0, delta: { content: fullContent }, finish_reason: null }]
                            })}\n\n`);
                            res.write(`data: ${JSON.stringify({
                                id: completionId,
                                object: 'chat.completion.chunk',
                                created: createdTime,
                                model: model,
                                choices: [{ index: 0, delta: {}, finish_reason: 'stop' }]
                            })}\n\n`);
                        }
                    }

                    res.write('data: [DONE]\n\n');
                    res.end();
                } else {
                    // Non-streaming response
                    let fullContent = '';
                    let fullThinking = '';

                    for await (const chunk of activeClient.streamResponse(completionResponse, session)) {
                        if (chunk.type === 'thinking') {
                            fullThinking += chunk.text;
                        } else if (chunk.type === 'content') {
                            fullContent += chunk.text;
                        }
                    }

                    let message = {
                        role: 'assistant',
                        content: fullContent,
                        reasoning_content: fullThinking || undefined
                    };
                    let finishReason = 'stop';

                    if (hasTools) {
                        const { cleanText, toolCalls } = parseToolCalls(fullContent, body.tools);
                        if (toolCalls.length > 0) {
                            console.log(`\x1b[32m[Tool Call Detected]\x1b[0m Returning ${toolCalls.length} tool call(s) to harness: ${toolCalls.map(t => t.function.name).join(', ')}`);
                            message.content = cleanText || null;
                            message.tool_calls = toolCalls;
                            finishReason = 'tool_calls';
                        }
                    }

                    const result = {
                        id: completionId,
                        object: 'chat.completion',
                        created: createdTime,
                        model: model,
                        choices: [
                            {
                                index: 0,
                                message: message,
                                finish_reason: finishReason
                            }
                        ],
                        usage: {
                            prompt_tokens: 0,
                            completion_tokens: 0,
                            total_tokens: 0
                        }
                    };

                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify(result));
                }
            } catch (err) {
                console.error('Server error handling completion:', err);
                if (!res.headersSent) {
                    const isAuthError = err.message && (
                        err.message.includes('40003') ||
                        err.message.toLowerCase().includes('authorization failed') ||
                        err.message.toLowerCase().includes('invalid token')
                    );
                    const statusCode = isAuthError ? 401 : 500;
                    const errorType = isAuthError ? 'authentication_error' : 'server_error';
                    const errorCode = isAuthError ? 'invalid_api_key' : undefined;

                    res.writeHead(statusCode, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({
                        error: {
                            message: err.message,
                            type: errorType,
                            code: errorCode
                        }
                    }));
                } else {
                    res.end();
                }
            }
            return;
        }

        // 404 Not Found
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: { message: `Route not found: ${req.method} ${pathname}`, type: 'invalid_request_error' } }));
    });

    return new Promise((resolve, reject) => {
        server.on('error', reject);
        server.listen(port, host, () => {
            console.log('\n┌────────────────────────────────────────────────────────────');
            console.log('│ \x1b[1;32m✅ [SERVER IS WORKING]\x1b[0m');
            console.log('├────────────────────────────────────────────────────────────');
            console.log(`│ 📍 Local URL  : http://localhost:${port}/v1`);
            if (isNetworkAvailable) {
                console.log(`│ 🌐 Network URL: http://${localIp}:${port}/v1`);
            }
            console.log(`│ 💬 Chat API   : POST /v1/chat/completions`);
            console.log(`│ 📋 Models API : GET  /v1/models`);
            console.log('├────────────────────────────────────────────────────────────');
            console.log('│ 🛑 To stop    : Press \x1b[1m\'q\'\x1b[0m or \x1b[1mCtrl+C\x1b[0m');
            console.log('└────────────────────────────────────────────────────────────\n');

            let isStopping = false;
            function stopServer() {
                if (isStopping) return;
                isStopping = true;
                console.log('\n\x1b[1;33m🛑 [SERVER STOPPED] Server has been shut down successfully.\x1b[0m\n');
                try {
                    server.close(() => process.exit(0));
                } catch (e) {
                    process.exit(0);
                }
                setTimeout(() => process.exit(0), 500);
            }

            process.on('SIGINT', stopServer);
            process.on('SIGTERM', stopServer);

            if (process.stdin.isTTY) {
                try {
                    process.stdin.setRawMode(true);
                    process.stdin.resume();
                    process.stdin.setEncoding('utf8');
                    process.stdin.on('data', (key) => {
                        if (key === 'q' || key === 'Q' || key === '\u0003') {
                            stopServer();
                        }
                    });
                } catch (e) { }
            } else {
                try {
                    process.stdin.resume();
                    process.stdin.on('data', (chunk) => {
                        const str = chunk.toString().trim().toLowerCase();
                        if (str === 'q' || str === 'stop' || str === 'exit') {
                            stopServer();
                        }
                    });
                } catch (e) { }
            }

            resolve(server);
        });
    });
}

module.exports = {
    startServer,
    parseJsonBody,
    formatMessagesToPrompt
};
