const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

class SessionManager {
  constructor(repoRoot) {
    this.repoRoot = repoRoot;
    this.sessionDir = path.join(repoRoot, '.agentops');
    this.sessionFile = path.join(this.sessionDir, 'run.json');
  }

  static getRepoRoot() {
    try {
      const root = execSync('git rev-parse --show-toplevel', {
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'ignore']
      }).trim();
      return root;
    } catch {
      return process.cwd();
    }
  }

  static getBranch() {
    try {
      return execSync('git rev-parse --abbrev-ref HEAD', {
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'ignore']
      }).trim();
    } catch {
      return null;
    }
  }

  static getRepoName(repoRoot) {
    return path.basename(repoRoot);
  }

  ensureGitignore() {
    const gitignorePath = path.join(this.repoRoot, '.gitignore');
    const entry = '.agentops/';

    try {
      if (fs.existsSync(gitignorePath)) {
        const content = fs.readFileSync(gitignorePath, 'utf8');
        const lines = content.split('\n');

        if (!lines.some(line => line.trim() === entry.trim())) {
          const newContent = content.endsWith('\n') ? content + entry + '\n' : content + '\n' + entry + '\n';
          fs.writeFileSync(gitignorePath, newContent, 'utf8');
        }
      } else {
        fs.writeFileSync(gitignorePath, entry + '\n', 'utf8');
      }
    } catch (err) {
      console.warn('Warning: Could not update .gitignore:', err.message);
    }
  }

  saveSession(sessionData) {
    try {
      if (!fs.existsSync(this.sessionDir)) {
        fs.mkdirSync(this.sessionDir, { recursive: true });
      }
      fs.writeFileSync(this.sessionFile, JSON.stringify(sessionData, null, 2), 'utf8');
      this.ensureGitignore();
    } catch (err) {
      throw new Error(`Failed to save session: ${err.message}`);
    }
  }

  loadSession() {
    try {
      if (!fs.existsSync(this.sessionFile)) {
        return null;
      }
      const content = fs.readFileSync(this.sessionFile, 'utf8');
      return JSON.parse(content);
    } catch (err) {
      throw new Error(`Failed to load session: ${err.message}`);
    }
  }

  deleteSession() {
    try {
      if (fs.existsSync(this.sessionFile)) {
        fs.unlinkSync(this.sessionFile);
      }
    } catch (err) {
      throw new Error(`Failed to delete session: ${err.message}`);
    }
  }

  hasActiveSession() {
    return fs.existsSync(this.sessionFile);
  }
}

module.exports = { SessionManager };
