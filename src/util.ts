import * as core from '@actions/core'
import {InputOptions} from '@actions/core'
import os from 'os'
import * as tc from '@actions/tool-cache'
import * as exec from '@actions/exec'
import path from 'path'
import * as io from '@actions/io'
import {ok} from 'assert'
import {v4 as uuidV4} from 'uuid'

export function getPathInput(name: string, options?: InputOptions): string {
  if (name.startsWith('/') === false) {
    name = path.join(process.cwd(), name)
  }
  return core.getInput(name, options).replace('~', os.homedir)
}

export function isSelfHosted(): boolean {
  return core.getBooleanInput('self-hosted')
}

export function getToolURL(tool: string, version: string): string {
  if (tool === 'llvm') {
    if (version === '9.0.1') {
      return getLLVM901URL()
    }
    if (version === '10.0.1') {
      return getLLVM1001URL()
    }
    if (version === '12.0.1') {
      return getLLVM1201URL()
    }
  }
  throw new Error(`no url found tool ${tool} version ${version}`)
}

export function getLLVM901URL(): string {
  if (isSelfHosted()) {
    return 'https://oneflow-static.oss-cn-beijing.aliyuncs.com/downloads/clang%2Bllvm-9.0.1-x86_64-linux-gnu-ubuntu-16.04.tar.xz'
  } else {
    return 'https://github.com/llvm/llvm-project/releases/download/llvmorg-9.0.1/clang+llvm-9.0.1-x86_64-linux-gnu-ubuntu-16.04.tar.xz'
  }
}

export function getLLVM1001URL(): string {
  if (isSelfHosted()) {
    return 'https://oneflow-static.oss-cn-beijing.aliyuncs.com/downloads/clang%2Bllvm-10.0.1-x86_64-linux-sles12.4.tar.xz'
  } else {
    return 'https://github.com/llvm/llvm-project/releases/download/llvmorg-10.0.1/clang+llvm-10.0.1-x86_64-linux-sles12.4.tar.xz'
  }
}

export function getLLVM1201URL(): string {
  if (isSelfHosted()) {
    return 'https://oneflow-static.oss-cn-beijing.aliyuncs.com/downloads/clang%2Bllvm-12.0.1-x86_64-linux-gnu-ubuntu-16.04.tar.xz'
  } else {
    return 'https://github.com/llvm/llvm-project/releases/download/llvmorg-12.0.1/clang+llvm-12.0.1-x86_64-linux-gnu-ubuntu-16.04.tar.xz'
  }
}

function _getTempDirectory(): string {
  const tempDirectory = process.env['RUNNER_TEMP'] || ''
  ok(tempDirectory, 'Expected RUNNER_TEMP to be defined')
  return tempDirectory
}

async function _createExtractFolder(dest?: string): Promise<string> {
  if (!dest) {
    // create a temp dir
    dest = path.join(_getTempDirectory(), uuidV4())
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
  dest = await _createExtractFolder(dest)

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

export async function ensureTool(
  tool: string,
  version: string,
  dest: string
): Promise<string> {
  let cachedPath = tc.find(tool, version)
  if (cachedPath === '') {
    const url = getToolURL(tool, version)
    const downloaded = await tc.downloadTool(url)
    const destExpanded = dest.replace('~', os.homedir)

    if (url.endsWith('tar.gz')) {
      const extracted = await tc.extractTar(downloaded, destExpanded)
      cachedPath = await tc.cacheDir(extracted, tool, version)
    } else if (url.endsWith('tar.xz')) {
      const extracted = await extractTarX(downloaded, destExpanded, ['xf'])
      cachedPath = await tc.cacheDir(extracted, tool, version)
    } else {
      throw new Error(`not supported: ${url}`)
    }
  }
  // TODO: parse from URL
  if (tool === 'llvm') {
    if (version === '10.0.1') {
      cachedPath = path.join(
        cachedPath,
        'clang+llvm-10.0.1-x86_64-linux-sles12.4'
      )
    }
    if (version === '9.0.1') {
      cachedPath = path.join(
        cachedPath,
        'clang+llvm-9.0.1-x86_64-linux-gnu-ubuntu-16.04'
      )
    }
  }
  return cachedPath
}
