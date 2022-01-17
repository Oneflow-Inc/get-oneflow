import * as core from '@actions/core'
import {ok} from 'assert'
import * as cache from './cache'

type Device = 'cuda' | 'cpu' | 'cuda-xla' | 'cpu-xla'
type Test =
  | 'legacy-benchmark'
  | 'legacy-op'
  | 'legacy-model'
  | 'module'
  | 'misc'
  | 'speed-test'

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
}
function isXla(device: Device): Boolean {
  return device === 'cuda-xla' || device === 'cpu-xla'
}

export type RunnerLabel =
  | 'cpu'
  | 'gpu'
  | 'provision'
  | 'speed-test'
  | 'cluster-1'

function getRunsOn(
  test: Test,
  deviceLabel: RunnerLabel,
  isDistributed: Boolean
): string[] {
  // TODO: throttle on runnerLabels
  let runnerLabels: RunnerLabel[] = getLabels()
  if (runnerLabels.includes('provision')) {
    return runnerLabels
  }
  if (test === 'speed-test') {
    runnerLabels = runnerLabels.concat(['speed-test'])
  }
  if (isDistributed) {
    runnerLabels = runnerLabels.concat(['cluster-1'])
  }
  return runnerLabels.concat([deviceLabel])
}

export type ComputePlatform = 'cpu' | 'cu102' | 'cu110_xla' | 'cu101_xla'
export function getLabels(): RunnerLabel[] {
  return core.getMultilineInput('runner-labels', {
    required: true
  }) as RunnerLabel[]
}

function getComputePlatform(device: Device): ComputePlatform {
  switch (device) {
    case 'cpu':
      return 'cpu'
    case 'cuda':
      return 'cu102'
    case 'cuda-xla':
      return 'cu101_xla'

    default:
      throw new Error(device)
  }
}

function getRunnerLabel(device: Device): RunnerLabel {
  switch (device) {
    case 'cpu':
      return 'cpu'
    case 'cuda':
      return 'gpu'
    case 'cuda-xla':
      return 'gpu'

    default:
      throw new Error(device)
  }
}

async function getSingleClientOpTests(): Promise<EntryInclude[]> {
  const includes: EntryInclude[] = []
  const devices: Device[] = ['cuda', 'cpu', 'cuda-xla']
  const tests: Test[] = ['legacy-op', 'legacy-model', 'legacy-benchmark']
  const digestType = 'single-client-test'
  for (const isExperimental of [true, false]) {
    for (const device of devices) {
      for (const isDistributed of [true, false]) {
        for (const test of tests) {
          if (isExperimental && test !== 'legacy-benchmark') continue
          if (device === 'cuda-xla' && isDistributed) continue
          if (test === 'legacy-model' && device !== 'cuda') continue
          if (test === 'legacy-benchmark' && device !== 'cuda') continue
          if (isDistributed && test !== 'legacy-op') continue
          if (isDistributed && device !== 'cuda') continue
          const digest = await cache.getDigestByType('single-client-test')
          const entry = `${device}-${test}${
            isDistributed ? '-distributed' : ''
          }${isExperimental ? '-experimental' : ''}`
          const cacheHit = await cache.isComplete(
            cache.keyFrom({entry, digest})
          )
          includes.push({
            entry,
            device,
            'is-single-client': true,
            'compute-platform': getComputePlatform(device),
            'cache-hit': cacheHit,
            'runs-on': cacheHit
              ? 'ubuntu-latest'
              : getRunsOn(test, getRunnerLabel(device), isDistributed),
            'is-distributed': isDistributed,
            'test-type': test,
            'is-xla': isXla(device),
            'is-experimental': isExperimental,
            'digest-type': digestType
          })
        }
      }
    }
  }
  return includes
}

async function getTests(): Promise<EntryInclude[]> {
  const includes: EntryInclude[] = []
  const devices: Device[] = ['cuda', 'cpu']
  const tests: Test[] = ['module', 'misc', 'speed-test']
  const digestType = 'test'
  for (const device of devices) {
    for (const isDistributed of [true, false]) {
      for (const test of tests) {
        const digest = await cache.getDigestByType(digestType)
        const entry = `${device}-${test}${isDistributed ? '-distributed' : ''}`
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
          'runs-on': cacheHit
            ? 'ubuntu-latest'
            : getRunsOn(test, getRunnerLabel(device), isDistributed),
          'is-distributed': isDistributed,
          'test-type': test,
          'is-xla': false,
          'is-experimental': false,
          'digest-type': digestType
        })
      }
    }
  }
  return includes
}

function checkUniqueIncludesByEntry(entryIncludes: EntryInclude[]): void {
  const uniqueItems = [...new Set(entryIncludes.map(x => x.entry))]
  ok(uniqueItems.length === entryIncludes.length)
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
        'runs-on': foundKey ? 'ubuntu-latest' : runnerLabels
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

interface DistributedEntryInclude {
  entry: string
  'compute-platform': string
  'cache-hit': Boolean
  'runs-on': string[] | string
  device: Device
  rank: number
  'is-distributed': true
  'digest-type': cache.DigestType
}

export async function setDistributedTestMatrix(): Promise<void> {
  interface Matrix {
    entry: string[]
    include: DistributedEntryInclude[]
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
