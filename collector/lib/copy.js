const { writeClipboard } = require('./clipboard');
const { SessionManager } = require('./session');
const { buildDashboardUrl } = require('./open');

async function copyCommand(options) {
  const runId = options.runId;

  if (!runId) {
    console.error('Error: No active session found and no --runId provided');
    console.error('Start a session first with: agentops start');
    console.error('Or provide a run ID with: --runId <id>');
    process.exit(1);
  }

  const url = buildDashboardUrl(runId, options);

  try {
    writeClipboard(url);
    console.log('Dashboard URL copied to clipboard:');
    console.log(url);
  } catch (err) {
    console.error(`Error: ${err.message}`);
    if (err.message.includes('Clipboard not supported')) {
      console.error('');
      console.error('To use clipboard features, install:');
      console.error('  macOS:   (built-in)');
      console.error('  Linux:   xclip or wl-clipboard');
      console.error('  Windows: (built-in)');
      console.error('');
      console.error('Dashboard URL:');
      console.log(url);
    }
    process.exit(1);
  }
}

module.exports = { copyCommand };
