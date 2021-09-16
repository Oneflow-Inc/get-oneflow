import * as core from '@actions/core'
import {ok} from 'assert'
import * as cache from './utils/cache'
async function run(): Promise<void> {
  try {
    const entry: string = core.getInput('entry', {required: true})
    const digestType: string = core.getInput('digest-type', {required: true})
    ok(['build', 'test'].includes(digestType))
    const cacheResult = await cache.queryCache({entry, digestType})
    const buildDigest = cacheResult.buildDigest
    const testDigest = cacheResult.testDigest
    const keys: string[] = cacheResult.keys
    core.saveState('keys', keys)
    let runnerLabels: string[] = core.getMultilineInput('runner-labels', {
      required: false
    })
    if (cacheResult.cacheHit) {
      runnerLabels = ['ubuntu-latest']
    }
    core.setOutput('runs-on', runnerLabels)
    // TODO: only outputs found keys
    core.setOutput('build-digest', buildDigest)
    core.setOutput('test-digest', testDigest)
    core.setOutput('cache-hit', cacheResult.cacheHit)
  } catch (error) {
    core.setFailed(error as Error)
  }
}

run()
