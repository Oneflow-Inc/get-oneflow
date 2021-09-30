import * as gh from '@actions/github'
import * as core from '@actions/core'
import {runAndSetFailed} from './utils/util'

runAndSetFailed(async () => {
  core.info(JSON.stringify(gh.context, null, 2))
})
