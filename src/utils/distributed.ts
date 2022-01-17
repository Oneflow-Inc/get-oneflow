import {getLabels, RunnerLabel} from './matrix'
import * as core from '@actions/core'
import * as gh from '@actions/github'
import {promisify} from 'util'
import {GitHub} from '@actions/github/lib/utils'

export function getOctokit(): InstanceType<typeof GitHub> {
  const token: string = core.getInput('access_token')
  return gh.getOctokit(token)
}
const octokit = getOctokit()
const sleep = promisify(setTimeout)
async function sleepSeconds(seconds: number): Promise<void> {
  await sleep(seconds * 1000)
}
async function sleepMinutes(minutes: number): Promise<void> {
  await sleepSeconds(minutes * 60)
}
export async function waitMatrixStartRunning(): Promise<void> {
  const run_id = gh.context.runId
  // TODO: max retry as input
  // TODO: boolean input: fail-at-max-retry
  // wait util this jobs in the matrix all start running
  const maxTry = 40
  let currentTry = 0
  while (currentTry < maxTry) {
    const jobs = (
      await octokit.request(
        'GET /repos/{owner}/{repo}/actions/runs/{run_id}/jobs',
        {
          owner: gh.context.repo.owner,
          repo: gh.context.repo.repo,
          run_id
        }
      )
    ).data.jobs
    jobs.reduce((acc, job) => job.status === 'in_progress' && acc, true)
    core.info(`[${currentTry}/${maxTry}]`)
    await sleepMinutes(1)
    currentTry += 1
  }
}

export async function genMatrix(): Promise<void> {
  // generate matrix for the distributed jobs
  // only proceed if no matrix is running
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const runnerLabels: RunnerLabel[] = getLabels()
}
