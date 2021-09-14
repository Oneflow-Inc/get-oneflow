import * as core from '@actions/core'
import {ok} from 'assert'
import * as cache from './utils/cache'

async function run(): Promise<void> {
  try {
    const markAsCompleted: Boolean = core.getBooleanInput('mark-as-completed', {
      required: true
    })
    const keys: string[] = JSON.parse(core.getState('keys'))
    // TODO: clear cache if failed
    if (markAsCompleted) {
      ok(keys)
      await cache.cacheComplete(keys)
    }
  } catch (error) {
    core.setFailed(error.message)
  }
}

run()
