import os from 'os'
type Rank = 0 | 1
type IPAddress = '192.168.1.11' | '192.168.1.12'
import * as core from '@actions/core'

function getMasterAddress(thisRank: Rank): IPAddress {
  if (thisRank === 0) {
    if (os.hostname() === 'oneflow-11') {
      return '192.168.1.11'
    } else {
      return '192.168.1.12'
    }
  }
  if (thisRank === 1) {
    if (os.hostname() === 'oneflow-12') {
      return '192.168.1.12'
    } else {
      return '192.168.1.11'
    }
  }
  throw new Error(
    `rank: ${thisRank} and hostname: ${os.hostname} is not supported`
  )
}

export function setIPAddress(): void {
  const rank = parseInt(core.getInput('rank')) as Rank
  const addr = getMasterAddress(rank)
  core.setOutput('master-address', addr)
}
