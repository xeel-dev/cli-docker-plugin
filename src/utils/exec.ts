import { exec as execAction } from '@actions/exec';
import { Writable } from 'node:stream';

export async function exec(...args: Parameters<typeof execAction>) {
  let [commandLine, execArgs, options] = args;
  options ??= {};
  options.ignoreReturnCode = true;
  let stdout = '';
  let stderr = '';
  let hasOutput = false;
  options.outStream = new Writable({
    write(chunk, encoding, callback) {
      if (!hasOutput) {
        // First chunk is the command itself, so we skip it
        hasOutput = true;
        return callback();
      }
      stdout += chunk.toString();
      callback();
    },
  });
  options.errStream = new Writable({
    write(chunk, encoding, callback) {
      stderr += chunk.toString();
      callback();
    },
  });

  try {
    const exitCode = await execAction(commandLine, execArgs, options);
    return { exitCode, stdout, stderr };
  } finally {
    options.outStream.end();
    options.errStream.end();
  }
}

export class ExecError extends Error {
  public readonly exitCode: number;
  public readonly stdout: string;
  public readonly stderr: string;
  constructor(
    public readonly command: string,
    { exitCode, stdout, stderr }: Awaited<ReturnType<typeof exec>>,
  ) {
    super(`Command "${command}" failed with exit code ${exitCode}`);
    this.name = 'ExecError';
    this.exitCode = exitCode;
    this.stdout = stdout;
    this.stderr = stderr;
  }
}
