import * as core from '@actions/core'
import * as cache from './utils/cache'

async function run(): Promise<void> {
  try {
    const keys: string[] = core.getMultilineInput('keys', {required: true})
    const onlyCheck: Boolean = core.getBooleanInput('only-check')
    if (!onlyCheck) {
      await cache.cacheComplete(keys)
    }
  } catch (error) {
    core.setFailed(error.message)
  }
}

run()
