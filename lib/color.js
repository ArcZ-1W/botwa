/**
 * ANSI Color helpers untuk output terminal yang bersih dan rapi
 */

const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    dim: '\x1b[2m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m',
    white: '\x1b[37m',
    bgGreen: '\x1b[42m',
    bgBlue: '\x1b[44m'
};

function color(text, colorName) {
    return `${colors[colorName] || ''}${text}${colors.reset}`;
}

module.exports = {
    color,
    info: (text) => console.log(`${color('[INFO]', 'cyan')} ${text}`),
    success: (text) => console.log(`${color('[SUCCESS]', 'green')} ${text}`),
    warn: (text) => console.log(`${color('[WARN]', 'yellow')} ${text}`),
    error: (text) => console.log(`${color('[ERROR]', 'red')} ${text}`)
};
