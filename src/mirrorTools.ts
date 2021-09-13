import * as core from '@actions/core'
import {DOCKER_TOOL_URLS} from './utils/docker'
import {TOOLS, mirrorToDownloads} from './utils/ensure'

async function run(): Promise<void> {
  try {
    for (const t of TOOLS) {
      await mirrorToDownloads(t.url)
    }
    for (const e of Object.entries(DOCKER_TOOL_URLS)) {
      await mirrorToDownloads(e[1])
    }
  } catch (error) {
    core.setFailed(error.message)
  }
}

run()
