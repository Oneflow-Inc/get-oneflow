import {DOCKER_TOOL_URLS} from './docker'
import {TOOLS, mirrorToDownloads} from './ensure'

export async function runMirror(): Promise<void> {
  for (const t of TOOLS) {
    await mirrorToDownloads(t.url)
  }
  for (const e of Object.entries(DOCKER_TOOL_URLS)) {
    await mirrorToDownloads(e[1])
  }
}
