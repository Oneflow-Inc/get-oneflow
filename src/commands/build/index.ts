import { Command, Flags } from '@oclif/core'
import * as process from 'process'
import os from 'os'
import { buildWithCondaOrManyLinux } from '../../buildOneFlow'
import * as env from '../../utils/env'

process.env['RUNNER_TOOL_CACHE'] = '~/runner_tool_cache'.replace('~', os.homedir)
process.env['RUNNER_TEMP'] = '~/runner_temp'.replace('~', os.homedir)
process.env['MANYLINUX'] = '1'

interface SimpleObject {
    [key: string]: any
}

export function fetch_yml_configuration(): SimpleObject {
    const yaml = require('js-yaml');
    const fs = require('fs');
    const yml_path = `${__dirname}/../../../action.yml`;
    const data = fs.readFileSync(yml_path, 'utf8');
    const settings = yaml.load(data).inputs as SimpleObject;
    return settings;
}

export default class Cuda extends Command {

    async init(): Promise<void> {
        let settings = fetch_yml_configuration();


        const flags = {} as SimpleObject;
        for (let key in settings) {
            let val = settings[key]['default'];
            let req = settings[key]['required'] == true && !val;
            let is_boolean = (val == 'true' || val == 'false');
            let description = settings[key]['description'];
            if (is_boolean) {
                env.setInput(key as string, 'false');
                flags[key] = Flags.boolean({
                    description: description
                })
            } else {
                if (val) env.setInput(key as string, val);
                flags[key] = Flags.string({
                    description: description,
                    required: req
                });
            }
        }
        Cuda.flags = flags;
    }
    static description = 'Build cuda version of oneflow';

    static examples = [
        `$ get-oneflow build --$key $value`,
    ];

    async run(): Promise<void> {
        const { args, flags } = await this.parse(Cuda);

        for (let key in flags as SimpleObject) {
            flags[key] == 'undefined' ? delete process.env[key] :
                env.setInput(key as string, flags[key]);
                console.log(` --set ${key}: ${flags[key]}`)
        }
        await buildWithCondaOrManyLinux();
    }


}
