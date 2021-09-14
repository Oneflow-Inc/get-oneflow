import * as cp from 'child_process'
import * as core from '@actions/core'

export async function cpExec(np: string, ip: string): Promise<void> {
  await new Promise((resolve, reject) => {
    const child = cp.execFile(np, [ip], {env: process.env})
    if (child.stdout) {
      child.stdout.on('data', core.info)
    }
    if (child.stderr) {
      child.stderr.on('data', core.info)
    }
    child.addListener('error', reject)
    child.addListener('exit', x => (x === 0 ? resolve(x) : reject(x)))
  })
}
