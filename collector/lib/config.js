const fs = require('fs');
const path = require('path');

/**
 * Strip // line comments from JSON content
 * This allows JSONC (JSON with Comments) support
 */
function stripLineComments(content) {
  return content
    .split('\n')
    .map(line => {
      // Find the first // that's not inside a string
      let inString = false;
      let escaped = false;
      let commentIndex = -1;

      for (let i = 0; i < line.length - 1; i++) {
        if (escaped) {
          escaped = false;
          continue;
        }
        if (line[i] === '\\') {
          escaped = true;
          continue;
        }
        if (line[i] === '"') {
          inString = !inString;
          continue;
        }
        // Check for // when not in a string
        if (!inString && line[i] === '/' && line[i + 1] === '/') {
          commentIndex = i;
          break;
        }
      }

      // If no comment found, return line as-is
      if (commentIndex === -1) return line;

      // Strip the comment
      return line.substring(0, commentIndex).trimEnd();
    })
    .join('\n');
}

/**
 * Load config from repo-local config file
 * Checks in priority order:
 * 1. <repoRoot>/.agentops/config.json
 * 2. <repoRoot>/.agentops/config.jsonc
 * 3. <repoRoot>/agentops.config.json
 */
function loadConfig(repoRoot) {
  const configPaths = [
    path.join(repoRoot, '.agentops', 'config.json'),
    path.join(repoRoot, '.agentops', 'config.jsonc'),
    path.join(repoRoot, 'agentops.config.json')
  ];

  for (const configPath of configPaths) {
    if (fs.existsSync(configPath)) {
      try {
        const content = fs.readFileSync(configPath, 'utf8');
        // Strip line comments if it's a .jsonc file or if comments are detected
        const cleanContent = configPath.endsWith('.jsonc') || content.includes('//')
          ? stripLineComments(content)
          : content;
        const config = JSON.parse(cleanContent);
        return { config, configPath };
      } catch (err) {
        throw new Error(`Failed to parse config file ${configPath}: ${err.message}`);
      }
    }
  }

  return { config: null, configPath: null };
}

/**
 * Merge config with CLI options and defaults
 * Priority: CLI flags > config file > defaults
 */
function mergeConfig(cliOptions, config, sessionData) {
  const defaults = {
    server: 'http://localhost:8787',
    dashboardUrl: 'http://localhost:5173',
    defaultTitle: 'Claude Session',
    watch: {
      mode: 'auto',
      path: '.',
      ignore: ['node_modules', '.git', 'dist', 'build', 'coverage'],
      diffInterval: 5000,
      pollInterval: 1000,
      batchWindowMs: 250
    },
    redact: true,
    toolDefaults: {
      tool: 'claude-code',
      model: 'sonnet'
    }
  };

  // Start with defaults
  const merged = { ...defaults };

  // Apply config file
  if (config) {
    if (config.server) merged.server = config.server;
    if (config.dashboardUrl) merged.dashboardUrl = config.dashboardUrl;
    if (config.defaultTitle) merged.defaultTitle = config.defaultTitle;
    if (config.redact !== undefined) merged.redact = config.redact;
    if (config.toolDefaults) {
      merged.toolDefaults = { ...merged.toolDefaults, ...config.toolDefaults };
    }
    if (config.watch) {
      merged.watch = { ...merged.watch, ...config.watch };
    }
  }

  // Apply session data (if active session exists)
  if (sessionData) {
    if (sessionData.server && !cliOptions.server) {
      merged.server = sessionData.server;
    }
    if (sessionData.runId && !cliOptions.runId) {
      merged.runId = sessionData.runId;
    }
  }

  // Apply CLI options (highest priority)
  if (cliOptions.server) merged.server = cliOptions.server;
  if (cliOptions.dashboardUrl) merged.dashboardUrl = cliOptions.dashboardUrl;
  if (cliOptions.title) merged.title = cliOptions.title;
  if (cliOptions.runId) merged.runId = cliOptions.runId;
  if (cliOptions.apiKey) merged.apiKey = cliOptions.apiKey;
  if (cliOptions.redact !== undefined) merged.redact = cliOptions.redact;

  // Watch-specific options
  if (cliOptions.path) merged.watch.path = cliOptions.path;
  if (cliOptions.mode) merged.watch.mode = cliOptions.mode;
  if (cliOptions.ignore) {
    merged.watch.ignore = cliOptions.ignore.split(',').map(s => s.trim());
  }
  if (cliOptions.diffInterval) merged.watch.diffInterval = parseInt(cliOptions.diffInterval, 10);
  if (cliOptions.pollInterval) merged.watch.pollInterval = parseInt(cliOptions.pollInterval, 10);
  if (cliOptions.batchWindowMs) merged.watch.batchWindowMs = parseInt(cliOptions.batchWindowMs, 10);
  if (cliOptions.noBatch) merged.watch.noBatch = true;
  if (cliOptions.noComplete !== undefined) merged.noComplete = cliOptions.noComplete;
  if (cliOptions.verbose) merged.verbose = cliOptions.verbose;

  // Dev command options
  if (cliOptions.open !== undefined) merged.open = cliOptions.open;
  if (cliOptions.noOpen !== undefined) merged.noOpen = cliOptions.noOpen;
  if (cliOptions.noWatch !== undefined) merged.noWatch = cliOptions.noWatch;
  if (cliOptions.newRun !== undefined) merged.newRun = cliOptions.newRun;

  // Tool defaults
  if (cliOptions.tool) merged.toolDefaults.tool = cliOptions.tool;
  if (cliOptions.model) merged.toolDefaults.model = cliOptions.model;

  // Other options
  if (cliOptions.level) merged.level = cliOptions.level;
  if (cliOptions.tag) merged.tag = cliOptions.tag;
  if (cliOptions.status) merged.status = cliOptions.status;
  if (cliOptions.errorMessage) merged.errorMessage = cliOptions.errorMessage;
  if (cliOptions.print) merged.print = cliOptions.print;

  // Tail options
  if (cliOptions.file) merged.file = cliOptions.file;
  if (cliOptions.follow !== undefined) merged.follow = cliOptions.follow;
  if (cliOptions.fromStart !== undefined) merged.fromStart = cliOptions.fromStart;
  if (cliOptions.interval) merged.interval = parseInt(cliOptions.interval, 10);
  if (cliOptions.maxLine) merged.maxLine = parseInt(cliOptions.maxLine, 10);
  if (cliOptions.filter) merged.filter = cliOptions.filter;
  if (cliOptions.pick) merged.pick = parseInt(cliOptions.pick, 10);
  if (cliOptions.json) merged.json = cliOptions.json;
  if (cliOptions.limit) merged.limit = parseInt(cliOptions.limit, 10);

  return merged;
}

/**
 * Default config template
 */
function getDefaultConfigTemplate(options = {}) {
  return {
    server: options.server || 'http://localhost:8787',
    dashboardUrl: options.dashboardUrl || 'http://localhost:5173',
    defaultTitle: 'Claude Session',
    watch: {
      mode: 'auto',
      path: '.',
      ignore: ['node_modules', '.git', 'dist', 'build', 'coverage'],
      diffInterval: 5000,
      pollInterval: 1000,
      batchWindowMs: 250
    },
    redact: true,
    toolDefaults: {
      tool: 'claude-code',
      model: 'sonnet'
    }
  };
}

module.exports = {
  loadConfig,
  mergeConfig,
  getDefaultConfigTemplate,
  stripLineComments
};
