function getEnvName(name: string): string {
  return `INPUT_${name.replace(/ /g, '_').toUpperCase()}`
}

export function setInput(name: string, value: string): void {
  process.env[getEnvName(name)] = value
}

export function setBooleanInput(name: string, value: Boolean): void {
  process.env[getEnvName(name)] = value ? 'true' : 'false'
}

export function setMultilineInput(name: string, value: string[]): void {
  process.env[getEnvName(name)] = value.join('\n')
}
