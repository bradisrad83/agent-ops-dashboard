const fs = require('fs');
const path = require('path');
const { SessionManager } = require('./session');
const { getDefaultConfigTemplate } = require('./config');

async function initCommand(options) {
  const repoRoot = SessionManager.getRepoRoot();
  const agentopsDir = path.join(repoRoot, '.agentops');
  const configPath = path.join(agentopsDir, 'config.json');

  console.log('Initializing AgentOps in:', repoRoot);
  console.log('');

  // Create .agentops directory
  if (!fs.existsSync(agentopsDir)) {
    fs.mkdirSync(agentopsDir, { recursive: true });
    console.log('✓ Created .agentops/ directory');
  } else {
    console.log('✓ .agentops/ directory already exists');
  }

  // Check if config already exists
  if (fs.existsSync(configPath) && !options.yes) {
    console.error('');
    console.error('Config file already exists:', configPath);
    console.error('Use --yes to overwrite');
    process.exit(1);
  }

  // Create config file
  const configTemplate = getDefaultConfigTemplate({
    server: options.server,
    dashboardUrl: options.dashboardUrl
  });

  try {
    fs.writeFileSync(configPath, JSON.stringify(configTemplate, null, 2), 'utf8');
    console.log('✓ Created config file:', configPath);
  } catch (err) {
    console.error('Failed to create config file:', err.message);
    process.exit(1);
  }

  // Ensure .agentops/ is in .gitignore
  const sessionManager = new SessionManager(repoRoot);
  try {
    sessionManager.ensureGitignore();
    console.log('✓ Added .agentops/ to .gitignore');
  } catch (err) {
    console.warn('Warning: Could not update .gitignore:', err.message);
  }

  // Print next steps
  console.log('');
  console.log('AgentOps initialized successfully!');
  console.log('');
  console.log('Next steps:');
  console.log('  1. Start a session:');
  console.log('     agentops start');
  console.log('');
  console.log('  2. Watch for changes:');
  console.log('     agentops watch');
  console.log('');
  console.log('  3. Open dashboard:');
  console.log('     agentops open');
  console.log('');
  console.log('Configuration file created at:');
  console.log('  ' + configPath);
  console.log('');
}

module.exports = { initCommand };
