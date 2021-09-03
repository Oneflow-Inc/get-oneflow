import * as core from '@actions/core'
import {InputOptions} from '@actions/core'
import os from 'os'
import * as exec from '@actions/exec'
import path from 'path'
import * as io from '@actions/io'
import {ok} from 'assert'
import {v4 as uuidV4} from 'uuid'

export function getPathInput(name: string, options?: InputOptions): string {
  let val = core.getInput(name, options).replace('~', os.homedir)
  if (val.startsWith('/') === false) {
    val = path.join(process.cwd(), val)
  }
  return val
}

export function isSelfHosted(): boolean {
  return core.getBooleanInput('self-hosted')
}

export function getTempDirectory(): string {
  const tempDirectory = process.env['RUNNER_TEMP'] || ''
  ok(tempDirectory, 'Expected RUNNER_TEMP to be defined')
  return tempDirectory.replace('~', os.homedir)
}

export async function createExtractFolder(dest?: string): Promise<string> {
  if (!dest) {
    // create a temp dir
    dest = path.join(getTempDirectory(), uuidV4())
  }
  await io.mkdirP(dest)
  return dest
}

export async function extractTarX(
  file: string,
  dest?: string,
  flags: string | string[] = 'xz'
): Promise<string> {
  if (!file) {
    throw new Error("parameter 'file' is required")
  }

  // Create dest
  dest = await createExtractFolder(dest)

  // Determine whether GNU tar
  core.debug('Checking tar --version')
  let versionOutput = ''
  await exec.exec('tar --version', [], {
    ignoreReturnCode: true,
    silent: true,
    listeners: {
      stdout: (data: Buffer) => (versionOutput += data.toString()),
      stderr: (data: Buffer) => (versionOutput += data.toString())
    }
  })
  core.debug(versionOutput.trim())
  const isGnuTar = versionOutput.toUpperCase().includes('GNU TAR')

  // Initialize args
  let args: string[] = [file]
  if (flags instanceof Array) {
    args = flags.concat(args)
  } else {
    args = [flags]
  }

  if (core.isDebug() && !flags.includes('v')) {
    args.push('-v')
  }

  if (isGnuTar) {
    // Suppress warnings when using GNU tar to extract archives created by BSD tar
    args.push('--warning=no-unknown-keyword')
    args.push('--overwrite')
  }

  args.push('-C', dest)
  await exec.exec(`tar`, args)

  return dest
}
