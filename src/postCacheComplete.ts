import * as core from '@actions/core'
import * as cache from './utils/cache'
async function run(): Promise<void> {
  try {
    const keys: string[] = core.getMultilineInput('keys', {required: true})
    await cache.cacheComplete(keys)
  } catch (error) {
    core.setFailed(error.message)
  }
}

run()
