import * as core from '@actions/core'
import {Octokit} from '@octokit/core'

const token = core.getInput('token')
const octokit = new Octokit({auth: token})
const owner = 'Oneflow-Inc'
const repo = 'oneflow'

export async function revivePRs(): Promise<void> {
  const test_workflow_id = 'test.yml'
  // find running test workflow runs
  const numInProgress = (
    await octokit.request(
      'GET /repos/{owner}/{repo}/actions/workflows/{workflow_id}/runs',
      {
        owner,
        repo,
        workflow_id: test_workflow_id,
        per_page: 30,
        status: 'in_progress'
      }
    )
  ).data.total_count
  core.warning(`numInProgress: ${numInProgress}`)
  // if there are no running test workflow runs, add ci-bot as reviewer for 3 PRs
  if (numInProgress === 0) {
    const Bot = 'oneflow-ci-bot'
    const q = `label:automerge state:open review:approved review-requested:${Bot} repo:${owner}/${repo}`
    core.warning(`q: ${q}`)
    const N = 3
    const eligiblePRs = (
      await octokit.request('GET /search/issues', {
        q
      })
    ).data.items
      .slice(0, N)
      .map(async issue => {
        if (issue.pull_request) {
          core.warning(
            `adding ${Bot} as reviewer for PR #${issue.number}, html_url: ${issue.html_url}`
          )
          const arg = {
            owner,
            repo,
            pull_number: issue.number,
            reviewers: [Bot]
          }
          await octokit.request(
            'DELETE /repos/{owner}/{repo}/pulls/{pull_number}/requested_reviewers',
            arg
          )
          await octokit.request(
            'POST /repos/{owner}/{repo}/pulls/{pull_number}/requested_reviewers',
            arg
          )
        }
      })
    await Promise.all(eligiblePRs)
  }
}
