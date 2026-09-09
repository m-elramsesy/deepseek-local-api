const http = require('http');
const os = require('os');
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
 * Convert OpenAI messages array into a prompt for DeepSeek
 */
function formatMessagesToPrompt(messages) {
    if (typeof messages === 'string') return messages;
    if (!Array.isArray(messages) || messages.length === 0) return '';

    if (messages.length === 1) {
        return messages[0].content || '';
    }

    const parts = [];
    for (const msg of messages) {
        const role = msg.role || 'user';
        const content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
        if (role === 'system') {
            parts.push(`[System]: ${content}`);
        } else if (role === 'user') {
            parts.push(`User: ${content}`);
        } else if (role === 'assistant') {
            parts.push(`Assistant: ${content}`);
        }
    }
    return parts.join('\n\n');
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
    const client = new DeepseekClient(token);
    process.stdout.write('Initializing DeepSeek client & WASM solver for local server... ');
    await client.initialize();
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
                const body = await parseJsonBody(req);
                const model = body.model || 'deepseek-chat';
                const stream = Boolean(body.stream);
                const isReasoner = model.includes('reasoner') || model.includes('r1');
                const thinking_enabled = body.thinking_enabled !== undefined ? body.thinking_enabled : isReasoner;
                const search_enabled = Boolean(body.search_enabled);

                const prompt = formatMessagesToPrompt(body.messages || body.prompt);
                if (!prompt) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: { message: 'Missing messages or prompt in request body', type: 'invalid_request_error' } }));
                    return;
                }

                // Create a fresh session for this completion request
                const session = await client.createSession();
                const completionResponse = await client.sendMessage(prompt, session, {
                    thinking_enabled,
                    search_enabled
                });

                const completionId = 'chatcmpl-' + Math.random().toString(36).substring(2, 15);
                const createdTime = Math.floor(Date.now() / 1000);

                if (stream) {
                    res.writeHead(200, {
                        'Content-Type': 'text/event-stream; charset=utf-8',
                        'Cache-Control': 'no-cache, no-transform',
                        'Connection': 'keep-alive',
                        'X-Accel-Buffering': 'no'
                    });

                    for await (const chunk of client.streamResponse(completionResponse, session)) {
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
                    res.write('data: [DONE]\n\n');
                    res.end();
                } else {
                    // Non-streaming response
                    let fullContent = '';
                    let fullThinking = '';

                    for await (const chunk of client.streamResponse(completionResponse, session)) {
                        if (chunk.type === 'thinking') {
                            fullThinking += chunk.text;
                        } else if (chunk.type === 'content') {
                            fullContent += chunk.text;
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
                                message: {
                                    role: 'assistant',
                                    content: fullContent,
                                    reasoning_content: fullThinking || undefined
                                },
                                finish_reason: 'stop'
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
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: { message: err.message, type: 'server_error' } }));
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
            const localIp = getLocalNetworkIp();
            console.log('\n┌──────────────────────────────────────────────────────────────────────────');
            console.log('│ 🚀 DeepSeek OpenAI-Compatible Local Server Running');
            console.log('├──────────────────────────────────────────────────────────────────────────');
            console.log(`│ 📍 Local Base URL    : http://localhost:${port}/v1`);
            if (isNetworkAvailable) {
                console.log(`│ 🌐 Network Base URL  : http://${localIp}:${port}/v1`);
                console.log(`│ 🔓 Network Access    : Enabled (0.0.0.0 - accessible to LAN devices)`);
            } else {
                console.log(`│ 🔒 Network Access    : Disabled (127.0.0.1 - localhost only)`);
            }
            console.log('├──────────────────────────────────────────────────────────────────────────');
            console.log(`│ 💬 Chat Endpoint     : POST http://localhost:${port}/v1/chat/completions`);
            console.log(`│ 📋 Models Endpoint   : GET  http://localhost:${port}/v1/models`);
            console.log('└──────────────────────────────────────────────────────────────────────────\n');
            resolve(server);
        });
    });
}

module.exports = {
    startServer,
    parseJsonBody,
    formatMessagesToPrompt
};
