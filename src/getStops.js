const { readFile } = require('node:fs/promises')
const { parse } = require('async-csv')

async function getStops () {
	const data = await readFile('./sources/stops.txt', 'utf-8')
	const stops = await parse(data, { columns: true })
	return stops
}

// internal util to test getStops
// async function stopsLogger () {
// 	const data = await getStops()
// 	console.log(data)
// }

// stopsLogger()

module.exports = getStops