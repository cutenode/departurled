const { resolve } = require('node:path')
const { readFileSync } = require('node:fs')

function getConfigData (configPath) {
	const resolvedConfigPath = resolve(configPath)
	const fileContents = readFileSync(resolvedConfigPath).toString()
	return JSON.parse(fileContents)
}

module.exports = getConfigData