import * as core from '@actions/core'
import * as cache from './utils/cache'
async function run(): Promise<void> {
  try {
    const entry: string = core.getInput('entry', {required: true})
    const keys: string[] = await cache.getOneFlowBuildCacheKeys(entry)
    let runnerLabels: string[] = core.getMultilineInput('runner-labels', {
      required: true
    })
    const checkNotCompleted: Boolean = core.getBooleanInput(
      'check-not-completed',
      {
        required: false
      }
    )
    // TODO: add condition
    const found = await cache.checkComplete(keys)
    if (checkNotCompleted) {
      if (found) {
        core.setFailed(`${found} marked as completed`)
        return
      }
    }
    if (found) {
      runnerLabels = ['ubuntu-latest']
      core.setOutput('object', found)
    }
    core.setOutput('runs-on', runnerLabels)
    core.setOutput('keys', keys)
    core.setOutput('cache-hit', !!found)
  } catch (error) {
    core.setFailed(error as Error)
  }
}

run()
