import * as core from '@actions/core'
import * as util from 'util'
import Table from 'cli-table3'
import {Octokit} from '@octokit/core'
import {components} from '@octokit/openapi-types/types'
import {Endpoints} from '@octokit/types/dist-types/generated/Endpoints'

const token = core.getInput('token')
const octokit = new Octokit({auth: token})
const owner = 'Oneflow-Inc'
const repo = 'oneflow'

function is_test_suite_job(j: components['schemas']['job']): Boolean {
  return (
    j.name.startsWith('Test suite') ||
    j.name.startsWith('Distributed test suite')
  )
}

function is_gpu_job(j: components['schemas']['job']): Boolean {
  return (
    ['CPU', 'CUDA', 'XLA'].includes(j.name) ||
    j.name === 'CUDA, XLA, CPU' ||
    j.name.startsWith('CUDA, XLA, CPU') ||
    (is_test_suite_job(j) &&
      (j.name.includes('cuda') || j.name.includes('xla')))
  )
}

async function is_occupying_gpu(
  wr: components['schemas']['workflow-run']
): Promise<Boolean> {
  const r = await octokit.request(
    'GET /repos/{owner}/{repo}/actions/runs/{run_id}/jobs',
    {owner, repo, run_id: wr.id}
  )
  const pr =
    wr.pull_requests === null || wr.pull_requests.length === 0
      ? '#?'
      : wr.pull_requests.map(x => `#${x.number}`).join(', ')
  core.info(wr.html_url)
  core.info(`${wr.id} ${wr.status} ${pr} ${wr.name}`)
  const table = new Table()
  r.data.jobs.map(j =>
    table.push([j.name, j.status, is_gpu_job(j) ? 'GPU' : '-'])
  )
  core.info(table.toString())
  const gpu_jobs_in_progress = r.data.jobs.filter(
    j => is_gpu_job(j) && j.status === 'in_progress'
  )
  const jobs_all_queued = r.data.jobs
    .filter(j => is_gpu_job(j))
    .every(j => j.status === 'queued' || j.status === 'in_progress')

  const test_suite_job_completed = r.data.jobs.filter(
    j => is_test_suite_job(j) && j.status === 'completed'
  )
  const test_suite_job_all = r.data.jobs.filter(j => is_test_suite_job(j))
  const job_not_all_completed =
    jobs_all_queued &&
    test_suite_job_completed.length !== test_suite_job_all.length

  // pass distributed
  const schedule_job = r.data.jobs.find(j => j.name === 'Wait for GPU slots')
  const has_passed_scheduler =
    schedule_job && schedule_job.status === 'completed' && job_not_all_completed

  // pass distributed
  const distributed_job = r.data.jobs.find(j => j.name.includes('Distributed'))
  const has_passed_distributed =
    distributed_job &&
    distributed_job.status === 'completed' &&
    job_not_all_completed

  return (
    has_passed_scheduler ||
    has_passed_distributed ||
    gpu_jobs_in_progress.length > 0
  )
}

// TODO: refactor into in_progress_runs_larger_that(1)
type Status = Endpoints['GET /repos/{owner}/{repo}/actions/runs']['parameters']['status']

async function num_in_progress_runs(statuses: Status[]): Promise<number> {
  let workflow_runs = (
    await Promise.all(
      statuses.map(async s => {
        const r = await octokit.request(
          'GET /repos/{owner}/{repo}/actions/runs',
          {
            owner,
            repo,
            status: s
          }
        )
        return r.data.workflow_runs
      })
    )
  ).reduce((acc, v) => {
    acc.push(...v)
    return acc
  }, [])

  core.info(`found ${workflow_runs.length} workflow runs for ${statuses}`)
  if (workflow_runs.length === 0) {
    core.info(`no workflow runs found for ${statuses}`)
    core.info('start querying 100 workflow runs')
    const test_workflow_id = 'test.yml'
    workflow_runs = (
      await octokit.request(
        'GET /repos/{owner}/{repo}/actions/workflows/{workflow_id}/runs',
        {
          owner,
          repo,
          workflow_id: test_workflow_id,
          per_page: 30
        }
      )
    ).data.workflow_runs.filter(
      w => w.status && statuses.includes(w.status as Status)
    )
    core.info(`found ${workflow_runs.length} workflow runs in last 100`)
  }
  const is_running_list = await Promise.all(
    workflow_runs.map(async wr => await is_occupying_gpu(wr))
  )
  const table = new Table()
  workflow_runs.map((wr, wr_i) => {
    table.push([
      wr.id,
      is_running_list[wr_i] ? 'running' : '--',
      (wr.pull_requests || []).map(pr => `#${pr.number}`).join(', '),
      (wr.pull_requests || [])
        .map(pr => `https://github.com/Oneflow-Inc/oneflow/pull/${pr.number}`)
        .join('\n'),
      wr.html_url
    ])
  })
  core.info(table.toString())
  return is_running_list.filter(is_running => is_running).length
}

const sleep = util.promisify(setTimeout)

export async function waitForGPURunner(): Promise<void> {
  let i = 0
  const max_try = parseInt(core.getInput('max-try-times'))
  const timeout_minutes = parseInt(core.getInput('timeout-minutes'))
  const max_num_parallel = 1
  while (i < max_try) {
    let num = 100000
    try {
      num = await num_in_progress_runs(['in_progress', 'queued'])
      core.info(`try  ${i + 1}/${max_try}, timeout ${timeout_minutes} minutes`)
      core.info(`runs ${num}, max: ${max_num_parallel}`)
    } catch (error) {
      core.setFailed(JSON.stringify(error, null, 2))
    }
    if (num < max_num_parallel) {
      break // success
    }
    const timeout = 60 * timeout_minutes
    await sleep(timeout * 1000)
    i += 1
  }
}
