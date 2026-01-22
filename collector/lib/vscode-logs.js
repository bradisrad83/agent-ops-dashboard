const fs = require('fs');
const path = require('path');
const os = require('os');
const { ApiClient } = require('./client');
const { SessionManager } = require('./session');

// Get VS Code log directories based on platform
function getVSCodeLogDirs() {
  const platform = os.platform();
  const home = os.homedir();

  if (platform === 'darwin') {
    return [
      path.join(home, 'Library/Application Support/Code/logs'),
      path.join(home, 'Library/Application Support/Code - Insiders/logs')
    ];
  } else if (platform === 'linux') {
    return [
      path.join(home, '.config/Code/logs'),
      path.join(home, '.config/Code - Insiders/logs')
    ];
  } else if (platform === 'win32') {
    return [
      path.join(home, 'AppData/Roaming/Code/logs'),
      path.join(home, 'AppData/Roaming/Code - Insiders/logs')
    ];
  }

  return [];
}

// Find log files in a directory
async function findLogFiles(baseDir, limit = 20) {
  const results = [];

  try {
    // Check if base directory exists
    const exists = await fs.promises.access(baseDir, fs.constants.R_OK)
      .then(() => true)
      .catch(() => false);

    if (!exists) return results;

    // Find most recent date directories
    const entries = await fs.promises.readdir(baseDir, { withFileTypes: true });
    const dateDirs = entries
      .filter(e => e.isDirectory())
      .map(e => ({
        name: e.name,
        path: path.join(baseDir, e.name)
      }))
      .sort((a, b) => b.name.localeCompare(a.name)) // Most recent first
      .slice(0, 3); // Only check last 3 date folders

    // Scan each date directory for log files
    for (const dateDir of dateDirs) {
      try {
        const files = await fs.promises.readdir(dateDir.path, { withFileTypes: true });

        for (const file of files) {
          if (!file.isFile()) continue;

          const fileName = file.name;
          const filePath = path.join(dateDir.path, fileName);

          // Filter for relevant log files
          if (!fileName.endsWith('.log')) continue;

          const stats = await fs.promises.stat(filePath);

          // Determine kind from filename
          let kind = 'other';
          if (fileName.includes('exthost')) kind = 'exthost';
          else if (fileName.includes('extension-output')) kind = 'extension';
          else if (fileName.includes('window')) kind = 'window';
          else if (fileName.includes('renderer')) kind = 'renderer';
          else if (fileName.includes('sharedprocess')) kind = 'shared';
          else if (fileName.includes('main')) kind = 'main';

          results.push({
            path: filePath,
            kind,
            mtime: stats.mtime,
            size: stats.size,
            fileName
          });
        }
      } catch (err) {
        // Skip unreadable directories
        continue;
      }
    }
  } catch (err) {
    // Base directory doesn't exist
    return results;
  }

  // Sort by mtime (most recent first) and limit
  return results
    .sort((a, b) => b.mtime - a.mtime)
    .slice(0, limit);
}

// Rank candidates by relevance
function rankCandidates(candidates) {
  const kindPriority = {
    'extension': 100,
    'exthost': 90,
    'window': 50,
    'renderer': 40,
    'shared': 30,
    'main': 20,
    'other': 10
  };

  return candidates.sort((a, b) => {
    const priorityDiff = (kindPriority[b.kind] || 0) - (kindPriority[a.kind] || 0);
    if (priorityDiff !== 0) return priorityDiff;

    // If same priority, sort by mtime
    return b.mtime - a.mtime;
  });
}

async function vscodeLogsCommand(options) {
  const limit = parseInt(options.limit) || 20;
  const json = options.json === true;

  const logDirs = getVSCodeLogDirs();
  let allCandidates = [];

  for (const dir of logDirs) {
    const candidates = await findLogFiles(dir, limit);
    allCandidates.push(...candidates);
  }

  if (allCandidates.length === 0) {
    if (json) {
      console.log(JSON.stringify({ candidates: [], message: 'No VS Code logs found' }, null, 2));
    } else {
      console.log('No VS Code logs found.');
      console.log('\nTips:');
      console.log('  1. Open VS Code → Help → Toggle Developer Tools');
      console.log('  2. Open Command Palette (Cmd+Shift+P) → "Developer: Open Logs Folder"');
      console.log('  3. Use: agentops tail --file <path-to-log-file>');
    }
    return;
  }

  // Rank and limit
  const rankedCandidates = rankCandidates(allCandidates).slice(0, limit);

  if (json) {
    console.log(JSON.stringify({
      candidates: rankedCandidates.map(c => ({
        path: c.path,
        kind: c.kind,
        mtime: c.mtime.toISOString(),
        size: c.size
      }))
    }, null, 2));
  } else {
    console.log(`Found ${rankedCandidates.length} VS Code log file(s):\n`);

    rankedCandidates.forEach((candidate, idx) => {
      const sizeKB = (candidate.size / 1024).toFixed(1);
      const timeAgo = getTimeAgo(candidate.mtime);

      console.log(`${idx + 1}. [${candidate.kind}] ${candidate.fileName}`);
      console.log(`   Path: ${candidate.path}`);
      console.log(`   Size: ${sizeKB} KB | Modified: ${timeAgo}\n`);
    });

    console.log('To tail a log file:');
    console.log('  agentops vscode tail');
    console.log('  agentops vscode tail --pick <index>');
    console.log('  agentops tail --file <path>');
  }

  // Optionally emit detection event
  const repoRoot = SessionManager.getRepoRoot();
  const sessionManager = new SessionManager(repoRoot);
  const session = sessionManager.loadSession();

  if (session && !json) {
    try {
      const serverUrl = options.server || session.server || 'http://localhost:8787';
      const apiKey = options.apiKey || session.apiKey;
      const client = new ApiClient(serverUrl, apiKey);

      await client.postEvent(session.runId, {
        type: 'vscode.detected',
        level: 'info',
        payload: {
          candidates: rankedCandidates.slice(0, 5).map(c => ({
            path: c.path,
            kind: c.kind
          }))
        }
      });
    } catch (err) {
      // Silently fail - this is optional
    }
  }
}

function getTimeAgo(date) {
  const seconds = Math.floor((new Date() - date) / 1000);

  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

module.exports = { vscodeLogsCommand, findLogFiles, rankCandidates, getVSCodeLogDirs };
