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

export async function parseLine(line: string): Promise<string | null> {
  const isInOneFlowTest = line.includes('python/oneflow/test')
  if (isInOneFlowTest) {
    const splits = line.split(' ')
    const last = splits[splits.length - 1]
    core.info(`last: ${last}`)
    return last
  } else {
    return null
  }
}

export async function collectWorkflowRunStatus(): Promise<void> {
  const test_workflow_id = 'test.yml'
  process.env['GITHUB_TOKEN'] = token
  let cnt = 0
  const TOTAL_PAGE = 5
  const PER_PAGE = 100
  const failed_job_names: string[] = []
  const caseNames: string[] = []
  for (let page = 1; page <= TOTAL_PAGE; page++) {
    const workflow_runs = await octokit.request(
      'GET /repos/{owner}/{repo}/actions/workflows/{workflow_id}/runs',
      {
        owner,
        repo,
        workflow_id: test_workflow_id,
        per_page: PER_PAGE,
        page,
        status: 'failure'
      }
    )
    for (const wr of workflow_runs.data.workflow_runs) {
      cnt += 1
      core.info(`[count] ${cnt}/${TOTAL_PAGE * PER_PAGE}`)
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
          if (job.name.includes('suite')) {
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
            const isFailure =
              line.includes('FAILURE') ||
              line.includes('FAILED') ||
              line.includes('ERROR: ')
            const isNoise =
              line.includes('= FAILURES =') ||
              line.includes('FAILED (errors=1)')
            if (isFailure && !isNoise) {
              core.info(`[failure] ${line}`)
              const parsed = await parseLine(line)
              if (parsed) {
                caseNames.push(parsed)
              }
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
  const caseSummary = Object.assign(
    {},
    ...Array.from(new Set(caseNames), key => ({
      [key]: caseNames.filter((value: string) => value === key).length
    }))
  )
  core.warning(`[cases] ${JSON.stringify(caseSummary, null, 2)}`)
  core.warning(`[summary] ${JSON.stringify(summary, null, 2)}`)
}

export async function collectWorkflowRunTime(): Promise<void> {
  const commits = (
    await octokit.request('GET /repos/{owner}/{repo}/commits', {
      owner,
      repo,
      per_page: 100
    })
  ).data
  for await (const commit of commits) {
    const prs = (
      await octokit.request(
        'GET /repos/{owner}/{repo}/commits/{commit_sha}/pulls',
        {
          owner,
          repo,
          commit_sha: commit.sha
        }
      )
    ).data
    for (const pr of prs) {
      core.info(`\n#${pr.number} ${pr.html_url}`)
      core.info(`[title] #${pr.title}`)
      let commits_of_pr = (
        await octokit.request(
          'GET /repos/{owner}/{repo}/pulls/{pull_number}/commits',
          {
            owner,
            repo,
            pull_number: pr.number
          }
        )
      ).data
      let max_in_pr = 0
      commits_of_pr = commits_of_pr.slice(-5, commits_of_pr.length)
      for await (const commit_of_pr of commits_of_pr) {
        const checks = (
          await octokit.request(
            'GET /repos/{owner}/{repo}/commits/{ref}/check-runs',
            {
              owner,
              repo,
              ref: commit_of_pr.sha
            }
          )
        ).data.check_runs
        for await (const check of checks) {
          if (check.name === 'Test suite (cuda-module)') {
            core.info(
              `[check][${check.name}][${check.status}]${check.html_url}`
            )
            // core.info(`${JSON.stringify(check, null, 2)}`)
            if (check.started_at && check.completed_at) {
              const started_at = Date.parse(check.started_at)
              const completed_at = Date.parse(check.completed_at)
              const duration = (completed_at - started_at) / 1000 / 60
              if (duration > max_in_pr) {
                max_in_pr = duration
              }
            }
          }
        }
      }
      if (max_in_pr > 25) {
        core.warning(`[duration] ${max_in_pr}`)
      } else {
        core.info(`[duration] ${max_in_pr}`)
      }
    }
  }
}
