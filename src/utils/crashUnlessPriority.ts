import {Octokit} from '@octokit/core'
import * as core from '@actions/core'
import * as gh from '@actions/github'

export async function checkPriorityPR(): Promise<void> {
  const token = core.getInput('token')
  const octokit = new Octokit({auth: token})
  const owner = 'Oneflow-Inc'
  const repo = 'oneflow'
  const priorityLabel = 'need-highest-priority'
  const priority_prs = (
    await octokit.request('GET /search/issues', {
      q: `label:need-highest-priority state:open repo:${owner}/${repo}`
    })
  ).data.items
  const MAX_NUM = 1
  if (priority_prs.length > MAX_NUM) {
    core.warning(
      `There are priority PRs: ${priority_prs.length} > ${MAX_NUM}.
No priority is effective.
Remove label '${priorityLabel}' from some PRs if you really need priority for your PR.`
    )
    return
  }
  if (
    priority_prs.length > 0 &&
    !priority_prs.map(pr => pr.number).includes(gh.context.issue.number)
  ) {
    const urls = priority_prs.map(pr => pr.html_url).join('\n')
    throw new Error(
      `CI of this PR is not allowed to run as long as priority PR is still open:\n${urls}`
    )
  }
}
