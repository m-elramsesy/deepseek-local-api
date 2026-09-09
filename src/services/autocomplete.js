/**
 * Autocomplete service for Readline terminal interface
 * Enables Tab completion for in-chat CLI commands
 */

const DEFAULT_COMMANDS = [
    '/help',
    '/id',
    '/url',
    '/new',
    '/sessions',
    '/switch',
    '/resume',
    '/thinking',
    '/think',
    '/search',
    '/web',
    '/server',
    '/exit',
    '/quit'
];

/**
 * Creates a Readline completer function
 * @param {string[]} [customCommands=[]] - Optional additional commands to autocomplete
 * @returns {(line: string) => [string[], string]}
 */
function createCompleter(customCommands = []) {
    const commandList = Array.from(new Set([...DEFAULT_COMMANDS, ...customCommands]));

    return function completer(line) {
        const trimmed = line.trimStart();

        // Autocomplete only when user starts typing a command with '/'
        if (trimmed.startsWith('/')) {
            const hits = commandList.filter((cmd) => cmd.startsWith(trimmed));
            return [hits.length ? hits : commandList, line];
        }

        // Return empty if not a slash command
        return [[], line];
    };
}

module.exports = {
    DEFAULT_COMMANDS,
    createCompleter
};
