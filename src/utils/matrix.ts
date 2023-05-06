import * as core from '@actions/core'
import {ok} from 'assert'
import * as cache from './cache'

type Device = 'cuda' | 'cpu'
type Test =
  | 'legacy-benchmark'
  | 'legacy-op'
  | 'legacy-model'
  | 'module'
  | 'misc'
  | 'speed-test'
  | 'benchmark'

interface EntryInclude {
  entry: string
  'compute-platform': string
  'cache-hit': Boolean
  'runs-on': string[] | string
  'test-type': Test
  device: Device
  'is-distributed': Boolean
  'is-single-client': Boolean
  'is-xla': Boolean
  'is-experimental': Boolean
  'digest-type': cache.DigestType
  rank: number
}

type RunnerLabel = 'cpu' | 'gpu' | 'provision' | 'speed-test' | 'cluster-1'

function getRunsOn(test: Test, deviceLabel: Device): string[] {
  // TODO: throttle on runnerLabels
  const runnerLabels: string[] = core.getMultilineInput('runner-labels', {
    required: true
  }) as RunnerLabel[]
  let suffix = 'a'
  switch (test) {
    case 'module':
      suffix = 'a'
      break
    case 'misc':
      suffix = 'b'
      break
    case 'speed-test':
      suffix = 'c'
      break
    default:
      suffix = 'a'
      break
  }
  return runnerLabels.concat([`${deviceLabel}-${suffix}`])
}

export type ComputePlatform = 'cpu' | 'cu116' | 'cu110_xla' | 'cu101_xla'
function getComputePlatform(device: Device): ComputePlatform {
  switch (device) {
    case 'cpu':
      return 'cpu'
    case 'cuda':
      return 'cu116'

    default:
      throw new Error(device)
  }
}

async function getSingleClientOpTests(): Promise<EntryInclude[]> {
  return []
}

async function getTests(): Promise<EntryInclude[]> {
  const includes: EntryInclude[] = []
  const devices: Device[] = core.getMultilineInput('devices') as Device[]
  const tests: Test[] = core.getMultilineInput('tests') as Test[]
  const isDistributed = core.getBooleanInput('include-distributed')
  const worldSize = parseInt(core.getInput('world-size'))
  for (let rank = 0; rank < worldSize; rank++) {
    for (const device of devices) {
      for (const test of tests) {
        let digestType: cache.DigestType = 'test'
        if (test === 'benchmark') {
          digestType = 'build'
          if (device !== 'cuda') {
            continue
          }
        }
        const digest = await cache.getDigestByType(digestType)
        let entry = `${device}-${test}${isDistributed ? '-distributed' : ''}`
        if (isDistributed) {
          entry = `${entry}-rank-${rank}`
        }
        if (test === 'speed-test' && device !== 'cuda') continue
        if (isDistributed && test !== 'module') continue
        if (isDistributed && device !== 'cuda') continue
        const cacheHit = await cache.isComplete(cache.keyFrom({entry, digest}))
        includes.push({
          entry,
          device,
          'is-single-client': false,
          'compute-platform': getComputePlatform(device),
          'cache-hit': cacheHit,
          'runs-on': cacheHit ? 'ubuntu-latest' : getRunsOn(test, device),
          'is-distributed': isDistributed,
          'test-type': test,
          'is-xla': false,
          'is-experimental': false,
          'digest-type': digestType,
          rank
        })
      }
    }
  }
  return includes
}

function checkUniqueIncludesByEntry(entryIncludes: EntryInclude[]): void {
  const uniqueItems = [...new Set(entryIncludes.map(x => x.entry))]
  ok(
    uniqueItems.length === entryIncludes.length,
    `not unique, entries: ${JSON.stringify(entryIncludes, null, 2)}`
  )
}

export async function setTestMatrix(): Promise<void> {
  interface Matrix {
    entry: string[]
    include: EntryInclude[]
  }
  const entryIncludes = (await getTests())
    .concat(await getSingleClientOpTests())
    .sort((a, b) => {
      if (a['test-type'] === 'legacy-op' && b['test-type'] !== 'legacy-op') {
        return -1
      } else {
        return 0
      }
    })
  ok(entryIncludes.length !== 0, 'entryIncludes.length !== 0')
  checkUniqueIncludesByEntry(entryIncludes)
  const matrix: Matrix = {
    entry: entryIncludes.map(x => x.entry),
    include: entryIncludes
  }
  // TODO: check by uniq
  core.setOutput('matrix', matrix)
  core.info(JSON.stringify(matrix, null, 2))
}

export async function setBuildMatrix(): Promise<void> {
  type Include = {
    entry: ComputePlatform
    'cache-hit': boolean
    'runs-on': 'ubuntu-latest' | string[]
    'build-digest': string
  }
  const entries: ComputePlatform[] = core.getMultilineInput('entries', {
    required: true
  }) as ComputePlatform[]
  const runnerLabels: string[] = core.getMultilineInput('runner-labels', {
    required: true
  })
  const deleteCache = core.getBooleanInput('delete-cache', {
    required: true
  })
  const buildDigest = await cache.getDigestByType('build')
  let entryIncludes: Include[] = []
  for (const entry of entries) {
    const keys = [cache.keyFrom({digest: buildDigest, entry})]
    if (deleteCache) {
      await cache.removeComplete(keys)
    }
    const foundKey = await cache.checkComplete(keys)
    entryIncludes = entryIncludes.concat([
      {
        entry,
        'cache-hit': !!foundKey,
        'runs-on': foundKey ? 'ubuntu-latest' : runnerLabels,
        'build-digest': buildDigest
      }
    ])
  }
  ok(entryIncludes.length !== 0, 'entryIncludes.length !== 0')
  const outputMatrix = {
    entry: entryIncludes.map(x => x.entry),
    include: entryIncludes
  }
  core.setOutput('matrix', outputMatrix)
  core.info(JSON.stringify(outputMatrix, null, 2))
}
