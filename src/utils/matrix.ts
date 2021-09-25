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
  'digest-type': cache.DigestType
}
function isXla(device: Device): Boolean {
  return device === 'cuda-xla' || device === 'cpu-xla'
}
type RunnerLabel = 'cpu' | 'gpu' | 'provision'
function getRunsOn(deviceLabel: RunnerLabel): string[] {
  // TODO: throttle on runnerLabels
  const runnerLabels: string[] = core.getMultilineInput('runner-labels', {
    required: true
  })
  if (runnerLabels.includes('provision')) {
    return runnerLabels
  }
  return runnerLabels.concat([deviceLabel])
}

export type ComputePlatform = 'cpu' | 'cu102' | 'cu110_xla' | 'cu101_xla'
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
  for (const device of devices) {
    for (const isDistributed of [true, false]) {
      for (const test of tests) {
        const digest = await cache.getDigestByType('single-client-test')
        const entry = `${device}-${test}${isDistributed ? '-distributed' : ''}`
        if (device === 'cuda-xla' && isDistributed) continue
        if (test === 'legacy-model' && device !== 'cuda') continue
        if (test === 'legacy-benchmark' && device !== 'cuda') continue
        if (isDistributed && test !== 'legacy-op') continue
        if (isDistributed && device !== 'cuda') continue
        const cacheHit = await cache.isComplete(cache.keyFrom({entry, digest}))
        includes.push({
          entry,
          device,
          'is-single-client': true,
          'compute-platform': getComputePlatform(device),
          'cache-hit': cacheHit,
          'runs-on': cacheHit
            ? 'ubuntu-latest'
            : getRunsOn(getRunnerLabel(device)),
          'is-distributed': isDistributed,
          'test-type': test,
          'is-xla': isXla(device),
          'digest-type': digestType
        })
      }
    }
  }
  return includes
}

async function getTests(): Promise<EntryInclude[]> {
  const includes: EntryInclude[] = []
  const devices: Device[] = ['cuda', 'cpu']
  const tests: Test[] = ['module', 'misc']
  const digestType = 'test'
  for (const device of devices) {
    for (const isDistributed of [true, false]) {
      for (const test of tests) {
        const digest = await cache.getDigestByType(digestType)
        const entry = `${device}-${test}${isDistributed ? '-distributed' : ''}`
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
            : getRunsOn(getRunnerLabel(device)),
          'is-distributed': isDistributed,
          'test-type': test,
          'is-xla': false,
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
  try {
    interface Matrix {
      entry: string[]
      include: EntryInclude[]
    }
    const entryIncludes = (await getTests()).concat(
      await getSingleClientOpTests()
    )
    ok(entryIncludes.length !== 0, 'entryIncludes.length !== 0')
    checkUniqueIncludesByEntry(entryIncludes)
    const matrix: Matrix = {
      entry: entryIncludes.map(x => x.entry),
      include: entryIncludes
    }
    // TODO: check by uniq
    core.setOutput('matrix', matrix)
    core.info(JSON.stringify(matrix, null, 2))
  } catch (error) {
    core.setFailed(error as Error)
  }
}
