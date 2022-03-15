/* eslint-disable @typescript-eslint/no-unused-vars */
import * as core from '@actions/core'
export async function benchmarkWithPytest(): Promise<void> {
  const pyTestScript = core.getInput('pytest-script')
  const benchmarkId = core.getInput('benchmark-id')
  const pytestArgs = core.getMultilineInput('pytest-args')
  const pytestCompareArgs = core.getMultilineInput('pytest-compare-args')
  // TODO: by yuhao
}
