import * as core from '@actions/core'
import {InputOptions} from '@actions/core'
import os from 'os'
import * as tc from '@actions/tool-cache'

export function getPathInput(name: string, options?: InputOptions): string {
  return core.getInput(name, options).replace('~', os.homedir)
}

export function isSelfHosted(): boolean {
  return core.getBooleanInput('self-hosted')
}

export function getToolURL(tool: string, version: string): string {
  if (tool === 'llvm') {
    if (version === '10.0.1') {
      return getLLVM1001URL()
    }
    if (version === '12.0.1') {
      return getLLVM1201URL()
    }
  }
  throw new Error(`no url found tool ${tool} version ${version}`)
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

export async function ensureToolkit(
  tool: string,
  version: string,
  dest: string
): Promise<string> {
  const url = getToolURL(tool, version)
  const downloaded = await tc.downloadTool(url)
  const destExpanded = dest.replace('~', os.homedir)
  if (url.endsWith('tar.xz') || url.endsWith('tar.gz')) {
    const extracted = await tc.extractTar(downloaded, destExpanded)
    const cachedPath = await tc.cacheDir(extracted, tool, version)
    return cachedPath
  } else {
    throw new Error(`not supported: ${url}`)
  }
}
