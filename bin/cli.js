#!/usr/bin/env node

const path = require('path');
const fs = require('fs');

// Attempt to load .env from current working directory, then fallback to package root
const cwdEnv = path.resolve(process.cwd(), '.env');
const pkgEnv = path.join(__dirname, '..', '.env');

if (fs.existsSync(cwdEnv)) {
    require('dotenv').config({ path: cwdEnv });
} else if (fs.existsSync(pkgEnv)) {
    require('dotenv').config({ path: pkgEnv });
} else {
    require('dotenv').config();
}

const args = process.argv.slice(2);

// Handle --help / -h
if (args.includes('--help') || args.includes('-h')) {
    console.log(`
\x1b[1;36mDeepSeek Local API & CLI Client\x1b[0m

\x1b[1mUSAGE:\x1b[0m
  deepseek-local-api [options] [message]
  deepseek [options] [message]

\x1b[1mMODES:\x1b[0m
  \x1b[32mInteractive Chat:\x1b[0m
    deepseek-local-api
    (Launches multi-turn interactive session with Tab autocomplete)

  \x1b[32mSingle Prompt:\x1b[0m
    deepseek-local-api "Your prompt message"
    deepseek-local-api "Your prompt" [session-id]

  \x1b[32mOpenAI-Compatible Local API Server:\x1b[0m
    deepseek-local-api --server 3000
    deepseek-local-api --server 8080 --network

\x1b[1mSERVER OPTIONS:\x1b[0m
  --server, -s [port]    Start OpenAI-compatible HTTP server (default port: 3000)
  --port, -p [port]      Alternative port flag
  --network, -n, --public Enable local network / LAN access (binds to 0.0.0.0)

\x1b[1mGENERAL OPTIONS:\x1b[0m
  --help, -h             Show this help screen
  --version, -v          Show package version

\x1b[1mENVIRONMENT VARIABLES:\x1b[0m
  DEEPSEEK_TOKEN         Your DeepSeek auth token (from chat.deepseek.com)
  DEEPSEEK_COOKIE        Optional WAF / session cookie
`);
    process.exit(0);
}

// Handle --version / -v
if (args.includes('--version') || args.includes('-v')) {
    const pkg = require('../package.json');
    console.log(`deepseek-local-api v${pkg.version}`);
    process.exit(0);
}

// Forward execution to main index runner
require('../src/index.js');
