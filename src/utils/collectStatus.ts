import * as glob from '@actions/glob'
import * as core from '@actions/core'
import * as readline from 'readline'
import {Octokit} from '@octokit/core'
import * as fs from 'fs'
import * as tc from '@actions/tool-cache'
import path from 'path'
const token = core.getInput('token')
const octokit = new Octokit({auth: token})
const owner = 'Oneflow-Inc'
const repo = 'oneflow'

export async function collectWorkflowRunStatus(): Promise<void> {
  const test_workflow_id = 'test.yml'
  process.env['GITHUB_TOKEN'] = token
  const failed_job_names: string[] = []
  for (let page = 1; page < 5; page++) {
    const workflow_runs = await octokit.request(
      'GET /repos/{owner}/{repo}/actions/workflows/{workflow_id}/runs',
      {
        owner,
        repo,
        workflow_id: test_workflow_id,
        per_page: 100,
        page,
        status: 'failure'
      }
    )
    for (const wr of workflow_runs.data.workflow_runs) {
      const jobs = (
        await octokit.request(
          'GET /repos/{owner}/{repo}/actions/runs/{run_id}/jobs',
          {owner, repo, run_id: wr.id}
        )
      ).data.jobs
      let should_collect = false
      for (const job of jobs) {
        if (job.conclusion === 'failure') {
          core.info(`[job][${job.name}] ${job.html_url}`)
          failed_job_names.push(job.name)
          if (job.name.includes('suite') || job.name.includes('analysis')) {
            should_collect = true
          }
        }
      }
      if (should_collect) {
        const dlResponse = await octokit.request(
          'GET /repos/{owner}/{repo}/actions/runs/{run_id}/logs',
          {
            owner,
            repo,
            run_id: wr.id
          }
        )
        core.info(`[downloading] ${dlResponse.url}`)
        const downloadedPath = await tc.downloadTool(`${dlResponse.url}`)
        const extractedFolder = await tc.extractZip(downloadedPath)
        const globber = await glob.create(
          path.join(extractedFolder, '**/*.txt'),
          {followSymbolicLinks: true}
        )
        for await (const file of globber.globGenerator()) {
          const fileStream = fs.createReadStream(file)
          const rl = readline.createInterface({
            input: fileStream,
            crlfDelay: Infinity
          })
          for await (const line of rl) {
            const is_failure =
              line.includes('FAILURE') ||
              line.includes('FAILED') ||
              line.includes('ERROR: ')
            const is_not_failure =
              line.includes('= FAILURES =') ||
              line.includes('FAILED (errors=1)')
            if (is_failure && !is_not_failure) {
              core.info(`[failure] ${line}`)
            }
          }
        }
      }
    }
  }

  const summary = Object.assign(
    {},
    ...Array.from(new Set(failed_job_names), key => ({
      [key]: failed_job_names.filter((value: string) => value === key).length
    }))
  )
  core.warning(`summary: ${JSON.stringify(summary, null, 2)}`)
}
