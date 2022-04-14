import * as core from '@actions/core'
import {Octokit} from '@octokit/core'
import * as exec from '@actions/exec'

const token = core.getInput('token')
const octokit = new Octokit({auth: token})
const owner = 'Oneflow-Inc'
const repo = 'oneflow'

export async function collectWorkflowRunStatus(): Promise<void> {
  const test_workflow_id = 'test.yml'
  const workflow_runs = await octokit.request(
    'GET /repos/{owner}/{repo}/actions/workflows/{workflow_id}/runs',
    {
      owner,
      repo,
      workflow_id: test_workflow_id,
      per_page: 30,
      status: 'failure'
    }
  )
  process.env['GITHUB_TOKEN'] = token
  workflow_runs.data.workflow_runs.map(wr => {
    exec.exec('gh', ['run', 'view', `${wr.id}`, '--log-failed'])
  })
}
