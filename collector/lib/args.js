function parseArgs(args) {
  const result = {
    command: 'watch',
    options: {},
    commandArgs: []
  };

  const validCommands = ['init', 'dev', 'watch', 'exec', 'run', 'start', 'stop', 'note', 'prompt', 'response', 'status', 'open', 'clip', 'copy', 'tail', 'vscode'];

  let commandFound = false;
  let i = 0;

  while (i < args.length) {
    const arg = args[i];

    // Only check for command if we haven't found one yet
    if (!commandFound && validCommands.includes(arg)) {
      result.command = arg;
      commandFound = true;
      i++;
      continue;
    }

    if (arg === '--') {
      result.commandArgs = args.slice(i + 1);
      break;
    }

    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const nextArg = args[i + 1];

      if (!nextArg || nextArg.startsWith('--')) {
        result.options[key] = true;
        i++;
      } else {
        // Support multiple values for the same flag (e.g., --tag foo --tag bar)
        if (result.options[key]) {
          if (Array.isArray(result.options[key])) {
            result.options[key].push(nextArg);
          } else {
            result.options[key] = [result.options[key], nextArg];
          }
        } else {
          result.options[key] = nextArg;
        }
        i += 2;
      }
    } else {
      result.commandArgs.push(arg);
      i++;
    }
  }

  return result;
}

module.exports = { parseArgs };
