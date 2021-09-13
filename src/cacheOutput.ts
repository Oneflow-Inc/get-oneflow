import * as core from '@actions/core'
import * as cache from './utils/cache'
async function run(): Promise<void> {
  try {
    const key: string = core.getInput('key', {required: true})
    const prefixes: string[] = core.getMultilineInput('prefixes', {
      required: true
    })
    let runnerLabels: string[] = core.getMultilineInput('runner-labels', {
      required: true
    })
    if (runnerLabels.length === 0) {
      core.setFailed('runner-labels empty')
      return
    }
    const keys = prefixes.map(x => x.concat(key))
    const found = await cache.lookupInKeys(keys)
    if (found) {
      runnerLabels = ['ubuntu-latest']
      core.setOutput('object', found)
    }
    core.setOutput('runs-on', runnerLabels)
    core.setOutput('prefixes', prefixes)
    core.setOutput('cache-hit', !!found)
  } catch (error) {
    core.setFailed(error.message)
  }
}

run()
