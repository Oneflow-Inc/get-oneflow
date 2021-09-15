import * as exec_ from '@actions/exec'
import * as core from '@actions/core'
import {ExecOptions, ExecOutput} from '@actions/exec'
/**
 * Exec a command.
 * Output will be streamed to the live console.
 * Returns promise with return code
 *
 * @param     commandLine        command to execute (can include additional args). Must be correctly escaped.
 * @param     args               optional arguments for tool. Escaping is handled by the lib.
 * @param     options            optional exec options.  See ExecOptions
 * @returns   Promise<number>    exit code
 */

export async function exec(
  commandLine: string,
  args?: string[],
  options?: ExecOptions
): Promise<number> {
  const isDryRun: boolean = core.getBooleanInput('dry-run')
  if (isDryRun) {
    return 0
  } else {
    return await exec_.exec(commandLine, args, options)
  }
}

/**
 * Exec a command and get the output.
 * Output will be streamed to the live console.
 * Returns promise with the exit code and collected stdout and stderr
 *
 * @param     commandLine           command to execute (can include additional args). Must be correctly escaped.
 * @param     args                  optional arguments for tool. Escaping is handled by the lib.
 * @param     options               optional exec options.  See ExecOptions
 * @returns   Promise<ExecOutput>   exit code, stdout, and stderr
 */
export async function getExecOutput(
  commandLine: string,
  args?: string[],
  options?: ExecOptions
): Promise<ExecOutput> {
  const isDryRun: boolean = core.getBooleanInput('dry-run')
  if (isDryRun) {
    return {
      exitCode: 0,
      stdout: 'dry-run',
      stderr: 'dry-run'
    }
  } else {
    return await exec_.getExecOutput(commandLine, args, options)
  }
}
