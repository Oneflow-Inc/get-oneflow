import {Octokit} from '@octokit/core'
import * as core from '@actions/core'
import * as gh from '@actions/github'

export async function checkPriorityPR(): Promise<void> {
  const token = core.getInput('token')
  const priorityPRNumber = core.getInput('priority-pr-number', {
    required: false
  })
  const octokit = new Octokit({auth: token})
  const owner = 'Oneflow-Inc'
  const repo = 'oneflow'
  if (priorityPRNumber) {
    const pull_number = parseInt(priorityPRNumber)
    if (pull_number === gh.context.issue.number) {
      return
    }
    const pr = await octokit.request(
      'GET /repos/{owner}/{repo}/pulls/{pull_number}',
      {
        owner,
        repo,
        pull_number
      }
    )
    if (pr.data.state === 'open') {
      throw new Error(
        `This PR is not allowed to run as long as priority PR is still open :#${pull_number} `
      )
    }
  }
}
