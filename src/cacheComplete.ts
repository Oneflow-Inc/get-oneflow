import * as core from '@actions/core'
import * as cache from './utils/cache'
async function run(): Promise<void> {
  try {
    const keys: string[] = core.getMultilineInput('keys', {required: true})
    let runnerLabels: string[] = core.getMultilineInput('runner-labels', {
      required: true
    })
    if (runnerLabels.length === 0) {
      core.setFailed('runner-labels empty')
      return
    }
    const found = await cache.checkComplete(keys)
    if (found) {
      runnerLabels = ['ubuntu-latest']
      core.setOutput('object', found)
    }
    core.setOutput('runs-on', runnerLabels)
    core.setOutput('keys', keys)
    core.setOutput('complete', !!found)
  } catch (error) {
    core.setFailed(error.message)
  }
}

run()
