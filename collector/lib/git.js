const { execSync } = require('child_process');
const path = require('path');

class GitMonitor {
  constructor(repoPath, options = {}) {
    this.repoPath = path.resolve(repoPath);
    this.diffInterval = options.diffInterval || 5000;
    this.onDiff = options.onDiff || (() => {});
    this.verbose = options.verbose || false;
    this.intervalHandle = null;
    this.gitAvailable = false;
  }

  log(...args) {
    if (this.verbose) {
      console.log('[git]', ...args);
    }
  }

  checkGitAvailable() {
    try {
      execSync('git --version', {
        cwd: this.repoPath,
        stdio: 'ignore',
        timeout: 5000
      });

      execSync('git rev-parse --git-dir', {
        cwd: this.repoPath,
        stdio: 'ignore',
        timeout: 5000
      });

      this.gitAvailable = true;
      this.log('Git repository detected');
      return true;
    } catch (err) {
      this.log('Git not available:', err.message);
      this.gitAvailable = false;
      return false;
    }
  }

  getRepoInfo() {
    if (!this.gitAvailable) return {};

    try {
      const branch = execSync('git rev-parse --abbrev-ref HEAD', {
        cwd: this.repoPath,
        encoding: 'utf8',
        timeout: 5000,
        stdio: ['pipe', 'pipe', 'ignore']
      }).trim();

      let repoName = null;
      try {
        const remote = execSync('git remote get-url origin', {
          cwd: this.repoPath,
          encoding: 'utf8',
          timeout: 5000,
          stdio: ['pipe', 'pipe', 'ignore']
        }).trim();

        const match = remote.match(/([^/:]+)\/([^/.]+)(\.git)?$/);
        if (match) {
          repoName = match[2];
        }
      } catch (e) {
        // No remote configured
      }

      return { branch, repoName };
    } catch (err) {
      this.log('Error getting repo info:', err.message);
      return {};
    }
  }

  runDiffCheck() {
    if (!this.gitAvailable) return;

    try {
      const statusPorcelain = execSync('git status --porcelain', {
        cwd: this.repoPath,
        encoding: 'utf8',
        maxBuffer: 1024 * 1024,
        timeout: 10000,
        stdio: ['pipe', 'pipe', 'ignore']
      }).trim();

      const diffStat = execSync('git diff --stat', {
        cwd: this.repoPath,
        encoding: 'utf8',
        maxBuffer: 1024 * 1024,
        timeout: 10000,
        stdio: ['pipe', 'pipe', 'ignore']
      }).trim();

      if (statusPorcelain || diffStat) {
        const truncatedStatus = statusPorcelain.length > 10000
          ? statusPorcelain.substring(0, 10000) + '\n... (truncated)'
          : statusPorcelain;

        const truncatedDiff = diffStat.length > 10000
          ? diffStat.substring(0, 10000) + '\n... (truncated)'
          : diffStat;

        this.onDiff({
          type: 'git.diff',
          payload: {
            statusPorcelain: truncatedStatus,
            diffStat: truncatedDiff,
            timestamp: new Date().toISOString(),
          },
        });
      }
    } catch (err) {
      this.log('Error running diff check:', err.message);
    }
  }

  start() {
    if (!this.checkGitAvailable()) {
      this.log('Git monitoring disabled');
      return false;
    }

    this.log('Starting git monitoring (interval:', this.diffInterval, 'ms)');
    this.runDiffCheck();

    this.intervalHandle = setInterval(() => {
      this.runDiffCheck();
    }, this.diffInterval);

    return true;
  }

  stop() {
    if (this.intervalHandle) {
      this.log('Stopping git monitoring');
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }
  }
}

module.exports = { GitMonitor };
