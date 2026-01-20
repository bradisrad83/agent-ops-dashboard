const { execSync } = require('child_process');
const os = require('os');
const { SessionManager } = require('./session');

function buildDashboardUrl(runId, options) {
  const baseUrl = options.dashboardUrl || 'http://localhost:5173';

  // Add runId as query parameter
  const url = new URL(baseUrl);
  url.searchParams.set('runId', runId);

  return url.toString();
}

function openUrl(url) {
  const platform = os.platform();

  try {
    if (platform === 'darwin') {
      execSync(`open "${url}"`, { stdio: 'ignore' });
      return true;
    }

    if (platform === 'linux') {
      try {
        execSync('which xdg-open', { stdio: 'ignore' });
        execSync(`xdg-open "${url}"`, { stdio: 'ignore' });
        return true;
      } catch {
        return false;
      }
    }

    if (platform === 'win32') {
      execSync(`start "" "${url}"`, { stdio: 'ignore', shell: true });
      return true;
    }

    return false;
  } catch (err) {
    return false;
  }
}

async function openCommand(options) {
  const runId = options.runId;
  const server = options.server;

  if (!runId) {
    console.error('Error: No active session found and no --runId provided');
    console.error('Start a session first with: agentops start');
    console.error('Or provide a run ID with: --runId <id>');
    process.exit(1);
  }

  const url = buildDashboardUrl(runId, options);

  if (options.print) {
    console.log(url);
    return;
  }

  const opened = openUrl(url);

  if (opened) {
    console.log(`Opening dashboard: ${url}`);
  } else {
    console.log('Could not open browser automatically. Visit:');
    console.log(url);
  }
}

module.exports = { openCommand, buildDashboardUrl };
