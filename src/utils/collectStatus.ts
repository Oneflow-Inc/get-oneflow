import * as core from '@actions/core'
import {Octokit} from '@octokit/core'
import * as exec from '@actions/exec'
import os from 'os'

const token = core.getInput('token')
const octokit = new Octokit({auth: token})
const owner = 'Oneflow-Inc'
const repo = 'oneflow'

export async function collectWorkflowRunStatus(): Promise<void> {
  const test_workflow_id = 'test.yml'
  const oneflowSrc: string = core
    .getInput('oneflow-src', {required: true})
    .replace('~', os.homedir)
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
  for (const wr of workflow_runs.data.workflow_runs) {
    const jobs = (
      await octokit.request(
        'GET /repos/{owner}/{repo}/actions/runs/{run_id}/jobs',
        {owner, repo, run_id: wr.id}
      )
    ).data.jobs
    for (const job of jobs) {
      if (job.conclusion === 'failure') {
        core.info(`${job.html_url}`)
      }
    }
    await exec.exec('gh', ['run', 'view', `${wr.id}`, '--log-failed'], {
      cwd: oneflowSrc
    })
  }
}
