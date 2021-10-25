import * as core from '@actions/core'

export async function findWheel(): Promise<void> {
  const commit_id = core.getInput('ref', {required: true})
  const compute_platform = core.getInput('platform', {required: true})
  core.info(`[commit_id] ${commit_id}`)
  core.info(`[compute_platform] ${compute_platform}`)

  core.setOutput('find-wheel-hit', 1)
}
