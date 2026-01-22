const { SessionManager } = require('./session');

function formatTimestamp(isoString) {
  const date = new Date(isoString);
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'just now';
  if (diffMins === 1) return '1 minute ago';
  if (diffMins < 60) return `${diffMins} minutes ago`;
  if (diffHours === 1) return '1 hour ago';
  if (diffHours < 24) return `${diffHours} hours ago`;
  if (diffDays === 1) return '1 day ago';
  return `${diffDays} days ago`;
}

async function statusCommand(options) {
  const repoRoot = SessionManager.getRepoRoot();
  const sessionManager = new SessionManager(repoRoot);

  if (!sessionManager.hasActiveSession()) {
    console.error('No active session found');
    console.error('Start a session with: agentops start');
    process.exit(1);
  }

  const session = sessionManager.loadSession();

  console.log('Active Session:');
  console.log(`  Run ID:     ${session.runId}`);
  console.log(`  Title:      ${session.title || '(untitled)'}`);
  console.log(`  Server:     ${session.server}`);
  console.log(`  Started:    ${formatTimestamp(session.startedAt)}`);
  console.log(`  Repo Root:  ${repoRoot}`);
  console.log('');
  console.log('Quick Commands:');
  console.log('  agentops open              Open dashboard to this run');
  console.log('  agentops clip note         Log clipboard as note');
  console.log('  agentops clip prompt       Log clipboard as LLM prompt');
  console.log('  agentops clip response     Log clipboard as LLM response');
  console.log('  agentops stop              Stop this session');
}

module.exports = { statusCommand };
