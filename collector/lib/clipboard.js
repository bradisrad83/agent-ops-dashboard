const { execSync } = require('child_process');
const os = require('os');

function getClipboardCommands() {
  const platform = os.platform();

  if (platform === 'darwin') {
    return { read: 'pbpaste', write: 'pbcopy' };
  }

  if (platform === 'linux') {
    // Try xclip first, then wl-paste (for Wayland)
    try {
      execSync('which xclip', { stdio: 'ignore' });
      return { read: 'xclip -o -selection clipboard', write: 'xclip -selection clipboard' };
    } catch {
      try {
        execSync('which wl-paste', { stdio: 'ignore' });
        return { read: 'wl-paste', write: 'wl-copy' };
      } catch {
        throw new Error('Clipboard not supported: install xclip or wl-clipboard');
      }
    }
  }

  if (platform === 'win32') {
    return {
      read: 'powershell -command "Get-Clipboard"',
      write: 'powershell -command "$input | Set-Clipboard"'
    };
  }

  throw new Error(`Clipboard operations not supported on platform: ${platform}`);
}

function readClipboard() {
  try {
    const commands = getClipboardCommands();
    const content = execSync(commands.read, {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe']
    });
    return content;
  } catch (err) {
    if (err.message.includes('Clipboard not supported')) {
      throw err;
    }
    throw new Error(`Failed to read clipboard: ${err.message}`);
  }
}

function writeClipboard(text) {
  try {
    const commands = getClipboardCommands();
    const platform = os.platform();

    if (platform === 'win32') {
      execSync(commands.write, {
        input: text,
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe']
      });
    } else {
      execSync(commands.write, {
        input: text,
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe']
      });
    }
  } catch (err) {
    if (err.message.includes('Clipboard not supported')) {
      throw err;
    }
    throw new Error(`Failed to write to clipboard: ${err.message}`);
  }
}

module.exports = { readClipboard, writeClipboard };
