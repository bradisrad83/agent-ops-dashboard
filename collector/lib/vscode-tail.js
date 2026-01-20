const { tailCommand } = require('./tail');
const { findLogFiles, rankCandidates, getVSCodeLogDirs } = require('./vscode-logs');

async function vscodeTailCommand(options) {
  let targetFile = options.file;

  // If file is explicitly provided, use it
  if (targetFile) {
    console.log(`Using specified file: ${targetFile}\n`);
    return tailCommand({ ...options, file: targetFile });
  }

  // Otherwise, detect best candidate
  const logDirs = getVSCodeLogDirs();
  let allCandidates = [];

  console.log('Detecting VS Code log files...');

  for (const dir of logDirs) {
    const candidates = await findLogFiles(dir, 20);
    allCandidates.push(...candidates);
  }

  if (allCandidates.length === 0) {
    console.error('\nError: No VS Code logs found.');
    console.error('\nTips:');
    console.error('  1. Open VS Code → Help → Toggle Developer Tools');
    console.error('  2. Open Command Palette (Cmd+Shift+P) → "Developer: Open Logs Folder"');
    console.error('  3. Use: agentops vscode tail --file <path-to-log-file>');
    process.exit(1);
  }

  const rankedCandidates = rankCandidates(allCandidates);

  // If --pick is specified, use that index
  if (options.pick !== undefined) {
    const pickIndex = parseInt(options.pick) - 1; // Convert to 0-based

    if (pickIndex < 0 || pickIndex >= rankedCandidates.length) {
      console.error(`\nError: Invalid pick index ${options.pick}. Valid range: 1-${rankedCandidates.length}`);
      process.exit(1);
    }

    targetFile = rankedCandidates[pickIndex].path;
    console.log(`Using picked file [${pickIndex + 1}]: ${targetFile}`);
  } else {
    // Choose best candidate (first in ranked list)
    targetFile = rankedCandidates[0].path;
    console.log(`Auto-selected: ${targetFile}`);
    console.log(`Kind: ${rankedCandidates[0].kind}`);
  }

  console.log('\nTo override, use: agentops vscode tail --file <path>');
  console.log(`Or pick from list: agentops vscode tail --pick <1-${rankedCandidates.length}>\n`);

  // Start tailing the selected file
  return tailCommand({ ...options, file: targetFile });
}

module.exports = { vscodeTailCommand };
