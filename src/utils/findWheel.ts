import * as core from '@actions/core'

export async function findWheel(): Promise<void> {
  const commit_id = core.getInput('ref', {required: true})
  const compute_platform = core.getInput('entry', {required: true})
  const python_version = core.getInput('python-version', {required: true})
  core.info(`[commit id] ${commit_id}`)
  core.info(`[compute platform entry] ${compute_platform}`)
  core.info(`[python version] ${python_version}`)

  core.setOutput('find-wheel-hit', 1)
}
