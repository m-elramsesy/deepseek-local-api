const path = require('path');
const fs = require('fs');
const os = require('os');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
require('dotenv').config();

const readline = require('readline');
const DeepseekClient = require('./client/DeepseekClient');
const ChatSession = require('./client/ChatSession');
const { startServer } = require('./services/server');
const { createCompleter } = require('./services/autocomplete');

function printSessionBanner(session) {
    const id = session.getId();
    const url = session.getWebUrl();
    console.log('\n┌──────────────────────────────────────────────────────────────────────────');
    console.log(`│ 💬 DeepSeek Session ID : ${id}`);
    console.log(`│ 🌐 Direct Web URL      : ${url}`);
    console.log('└──────────────────────────────────────────────────────────────────────────\n');
}

/**
 * Send a message to DeepSeek and stream the response to console
 * @param {string} token - DeepSeek auth token
 * @param {string} message - Message prompt
 * @param {string|null} sessionIdOrUrl - Optional existing session ID or web URL
 * @returns {Promise<ChatSession>}
 */
async function chat(token, message, sessionIdOrUrl = null) {
    const client = new DeepseekClient(token);
    await client.initialize();

    let session;
    if (sessionIdOrUrl) {
        console.log(`Connecting to existing session: ${sessionIdOrUrl}...`);
        session = await client.resumeSession(sessionIdOrUrl);
    } else {
        session = await client.createSession();
    }

    printSessionBanner(session);

    console.log(`User: ${message}\n`);
    const response = await client.sendMessage(message, session, {
        thinking_enabled: true,
        search_enabled: false
    });

    let currentMode = null;
    for await (const chunk of client.streamResponse(response, session)) {
        if (typeof chunk === 'string') {
            process.stdout.write(chunk);
        } else if (chunk.type === 'thinking') {
            if (currentMode !== 'thinking') {
                process.stdout.write('\n\x1b[2m[Thinking Process]:\n');
                currentMode = 'thinking';
            }
            process.stdout.write(chunk.text);
        } else if (chunk.type === 'content') {
            if (currentMode === 'thinking') {
                process.stdout.write('\x1b[0m\n\nAssistant:\n');
                currentMode = 'content';
            } else if (currentMode === null) {
                process.stdout.write('Assistant:\n');
                currentMode = 'content';
            }
            process.stdout.write(chunk.text);
        }
    }
    process.stdout.write('\x1b[0m\n\n');
    return session;
}

/**
 * Start an interactive multi-turn chat session in terminal
 */
async function startInteractive(token, initialSessionIdOrUrl = null) {
    const client = new DeepseekClient(token);
    process.stdout.write('Initializing DeepSeek client & WASM solver... ');
    await client.initialize();
    console.log('Done.\n');

    let currentSession = null;
    if (initialSessionIdOrUrl) {
        currentSession = await client.resumeSession(initialSessionIdOrUrl);
    } else {
        const saved = ChatSession.loadAllSavedSessions();
        if (saved.length > 0) {
            console.log('Recent Saved Sessions:');
            saved.slice(0, 5).forEach((s, idx) => {
                console.log(`  [${idx + 1}] ${s.title || 'Untitled'} (${s.id})`);
            });
            console.log('  [0] Start a brand new session\n');
        }

        const rlInit = readline.createInterface({ input: process.stdin, output: process.stdout });
        const choice = await new Promise(resolve => {
            rlInit.question('Enter number, paste a Session ID / Web URL, or press Enter for new session: ', answer => {
                rlInit.close();
                resolve(answer.trim());
            });
        });

        const num = parseInt(choice, 10);
        if (!isNaN(num) && num > 0 && num <= saved.length) {
            currentSession = await client.resumeSession(saved[num - 1].id);
        } else if (choice.length > 10) {
            currentSession = await client.resumeSession(choice);
        } else {
            currentSession = await client.createSession();
        }
    }

    printSessionBanner(currentSession);
    console.log('Commands: /help (list all), /thinking (toggle think), /search (toggle web), /server (start API), /exit\n');
    console.log('\x1b[2m(Tip: Press Tab to autocomplete commands)\x1b[0m\n');

    let thinkingEnabled = true;
    let searchEnabled = false;

    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
        prompt: 'You > ',
        completer: createCompleter()
    });

    rl.prompt();

    rl.on('line', async (line) => {
        const input = line.trim();
        if (!input) {
            rl.prompt();
            return;
        }

        if (input === '/exit' || input === '/quit') {
            rl.close();
            process.exit(0);
        }

        if (input === '/help') {
            console.log('\nAvailable In-Chat Commands (Press Tab to autocomplete):');
            console.log('  /id          - Show current session ID and web URL');
            console.log('  /new         - Start a brand new session');
            console.log('  /resume [id] - Resume an existing session by ID or URL');
            console.log(`  /thinking    - Toggle thinking mode (current: ${thinkingEnabled ? 'ON' : 'OFF'})`);
            console.log(`  /search      - Toggle web search (current: ${searchEnabled ? 'ON' : 'OFF'})`);
            console.log('  /server [p]  - Start local OpenAI-compatible server on port [p]');
            console.log('  /exit        - Exit the chat\n');
            rl.prompt();
            return;
        }

        if (input === '/id' || input === '/url') {
            printSessionBanner(currentSession);
            rl.prompt();
            return;
        }

        if (input === '/thinking' || input === '/think') {
            thinkingEnabled = !thinkingEnabled;
            console.log(`💡 Thinking Mode: ${thinkingEnabled ? '\x1b[32mON\x1b[0m (DeepSeek Reasoner enabled)' : '\x1b[31mOFF\x1b[0m'}\n`);
            rl.prompt();
            return;
        }

        if (input === '/search' || input === '/web') {
            searchEnabled = !searchEnabled;
            console.log(`🌐 Web Search: ${searchEnabled ? '\x1b[32mON\x1b[0m' : '\x1b[31mOFF\x1b[0m'}\n`);
            rl.prompt();
            return;
        }

        if (input.startsWith('/server')) {
            const parts = input.split(/\s+/);
            const targetPort = parts[1] ? parseInt(parts[1], 10) : 3000;
            const isNet = parts.includes('--network') || parts.includes('-n');
            console.log(`\n🚀 Launching local OpenAI-compatible API server on port ${targetPort}...`);
            startServer({ token, port: targetPort, isNetworkAvailable: isNet }).catch(err => {
                console.error('Failed to start server:', err.message);
            });
            return;
        }

        if (input === '/new') {
            currentSession = await client.createSession();
            console.log('✓ Started new session:');
            printSessionBanner(currentSession);
            rl.prompt();
            return;
        }

        if (input.startsWith('/resume ')) {
            const targetId = input.slice(8).trim();
            currentSession = await client.resumeSession(targetId);
            console.log('✓ Resumed session:');
            printSessionBanner(currentSession);
            rl.prompt();
            return;
        }

        try {
            const response = await client.sendMessage(input, currentSession, {
                thinking_enabled: thinkingEnabled,
                search_enabled: searchEnabled
            });

            let currentMode = null;
            for await (const chunk of client.streamResponse(response, currentSession)) {
                if (typeof chunk === 'string') {
                    process.stdout.write(chunk);
                } else if (chunk.type === 'thinking') {
                    if (currentMode !== 'thinking') {
                        process.stdout.write('\n\x1b[2m[Thinking Process]:\n');
                        currentMode = 'thinking';
                    }
                    process.stdout.write(chunk.text);
                } else if (chunk.type === 'content') {
                    if (currentMode === 'thinking') {
                        process.stdout.write('\x1b[0m\n\nDeepSeek:\n');
                        currentMode = 'content';
                    } else if (currentMode === null) {
                        process.stdout.write('DeepSeek:\n');
                        currentMode = 'content';
                    }
                    process.stdout.write(chunk.text);
                }
            }
            process.stdout.write('\x1b[0m\n\n');
        } catch (err) {
            console.error('\nError:', err.message, '\n');
        }

        rl.prompt();
    });
}

function parseCliArgs(argv) {
    const args = argv.slice(2);
    let isServer = false;
    let port = 3000;
    let isNetworkAvailable = false;
    let cliToken = null;
    const otherArgs = [];

    for (let i = 0; i < args.length; i++) {
        const arg = args[i];

        if (arg === '--network' || arg === '--public' || arg === '-n') {
            isNetworkAvailable = true;
            continue;
        }

        if (arg === '--token' || arg === '-t') {
            const next = args[i + 1];
            if (next && !next.startsWith('-')) {
                cliToken = next;
                i++;
            }
            continue;
        }

        if (arg.startsWith('--token=')) {
            cliToken = arg.split('=')[1];
            continue;
        }

        if (arg === '--server' || arg === '-s' || arg === '--port' || arg === '-p') {
            isServer = true;
            const next = args[i + 1];
            if (next && !next.startsWith('-')) {
                const parsedPort = parseInt(next, 10);
                if (!isNaN(parsedPort) && parsedPort > 0) {
                    port = parsedPort;
                    i++;
                }
            }
            continue;
        }

        if (arg.startsWith('--server=') || arg.startsWith('--port=')) {
            isServer = true;
            const val = arg.split('=')[1];
            const parsedPort = parseInt(val, 10);
            if (!isNaN(parsedPort) && parsedPort > 0) {
                port = parsedPort;
            }
            continue;
        }

        otherArgs.push(arg);
    }

    return { isServer, port, isNetworkAvailable, cliToken, otherArgs };
}

async function promptForToken() {
    if (!process.stdin.isTTY) {
        return null;
    }

    return new Promise((resolve) => {
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });

        console.log('\n\x1b[1;33m⚠️  DeepSeek authentication token not detected.\x1b[0m');
        console.log('To start the DeepSeek Local API Server or CLI, a valid token is strictly required.');
        console.log('\x1b[2m(Obtain it from chat.deepseek.com -> DevTools -> Application -> Local Storage -> userToken)\x1b[0m\n');

        rl.question('\x1b[1;36m👉 Please paste your DEEPSEEK_TOKEN:\x1b[0m ', (answer) => {
            rl.close();
            const token = answer.trim().replace(/^["']|["']$/g, '');
            resolve(token || null);
        });
    });
}

function saveTokenToHomeEnv(token) {
    try {
        const homeDir = path.join(os.homedir(), '.deepseek-local-api');
        if (!fs.existsSync(homeDir)) {
            fs.mkdirSync(homeDir, { recursive: true });
        }
        const envFile = path.join(homeDir, '.env');
        fs.writeFileSync(envFile, `DEEPSEEK_TOKEN="${token}"\n`, 'utf8');
        console.log(`\x1b[32m✓ Token saved to ${envFile} (saved for all future npx and CLI calls).\x1b[0m\n`);
    } catch (e) {
        // Non-fatal if cannot write
    }
}

async function ensureToken(cliToken) {
    if (cliToken && cliToken.trim()) {
        const cleaned = cliToken.trim().replace(/^["']|["']$/g, '');
        process.env.DEEPSEEK_TOKEN = cleaned;
        saveTokenToHomeEnv(cleaned);
        return cleaned;
    }

    if (process.env.DEEPSEEK_TOKEN && process.env.DEEPSEEK_TOKEN.trim()) {
        return process.env.DEEPSEEK_TOKEN.trim();
    }

    // Try interactive prompt if in terminal
    const prompted = await promptForToken();
    if (prompted) {
        process.env.DEEPSEEK_TOKEN = prompted;
        saveTokenToHomeEnv(prompted);
        return prompted;
    }

    // Strict failure message
    console.error('\n\x1b[1;31mError: DEEPSEEK_TOKEN is strictly required.\x1b[0m');
    console.error('The server or CLI cannot run without a valid token.\n');
    console.error('You can provide your token using any of these methods:');
    console.error('  1. Pass via CLI parameter:');
    console.error('     npx @ramsesy/deepseek-local-api -s 4040 --token "your_token"');
    console.error('     deepseek -s 4040 -t "your_token"\n');
    console.error('  2. In a .env file in the current folder:');
    console.error('     DEEPSEEK_TOKEN="your_token_here"\n');
    console.error('  3. In system environment variables:');
    console.error('     Windows CMD        : set DEEPSEEK_TOKEN=your_token');
    console.error('     Windows PowerShell : $env:DEEPSEEK_TOKEN="your_token"');
    console.error('     macOS / Linux      : export DEEPSEEK_TOKEN="your_token"\n');
    console.error('Tip: You can obtain your token from https://chat.deepseek.com (DevTools -> Application -> Local Storage -> userToken).\n');
    process.exit(1);
}

async function runCli() {
    const { isServer, port, isNetworkAvailable, cliToken, otherArgs } = parseCliArgs(process.argv);
    const token = await ensureToken(cliToken);

    if (isServer) {
        startServer({ token, port, isNetworkAvailable }).catch(err => {
            console.error('Failed to start server:', err.message);
            process.exit(1);
        });
    } else {
        const messageArg = otherArgs[0];
        const sessionArg = otherArgs[1];

        if (messageArg && messageArg !== '--interactive' && messageArg !== '-i') {
            chat(token, messageArg, sessionArg).catch(console.error);
        } else {
            startInteractive(token, sessionArg).catch(console.error);
        }
    }
}

module.exports = { chat, startInteractive, startServer, parseCliArgs, runCli };

if (require.main === module) {
    runCli();
} 