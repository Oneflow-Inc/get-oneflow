import {Octokit} from '@octokit/core'
import * as core from '@actions/core'

export async function checkPriorityPR(): Promise<void> {
  const token = core.getInput('token')
  const priorityPRNumber = core.getInput('priority-pr-number', {
    required: false
  })
  const octokit = new Octokit({auth: token})
  const owner = 'Oneflow-Inc'
  const repo = 'oneflow'
  if (priorityPRNumber) {
    const pr = await octokit.request(
      'GET /repos/{owner}/{repo}/pulls/{pull_number}',
      {
        owner,
        repo,
        pull_number: parseInt(priorityPRNumber)
      }
    )
    if (pr.data.state === 'open') {
      throw new Error(`Priority PR is still open :#${priorityPRNumber}`)
    }
  }
}
