function parseArgs(args) {
  const result = {
    command: 'watch',
    options: {},
    commandArgs: []
  };

  let i = 0;
  while (i < args.length) {
    const arg = args[i];

    if (arg === 'watch' || arg === 'exec') {
      result.command = arg;
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
        result.options[key] = nextArg;
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
