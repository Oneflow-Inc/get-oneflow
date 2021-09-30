import * as gh from '@actions/github'
import * as core from '@actions/core'
import {runAndSetFailed} from './utils/util'

runAndSetFailed(async () => {
  core.debug(JSON.stringify(gh, null, 2))
})
