const convertUnixTimestampToDate = require('./convertUnixTimestampToDate')

function prettifyUpdate({ stopId, stopName, routeId, arrivalTime, departureTime, reachable }) {
	const data = {
		stopId: stopId,
		stopName: stopName,
		routeId: routeId,
		arrivalTime: convertUnixTimestampToDate(arrivalTime),
		departureTime: convertUnixTimestampToDate(departureTime),
		direction: stopId[stopId.length - 1].includes('S') ? 'downtown' : 'uptown',
		reachable
	}
	
	return data
}

module.exports = prettifyUpdate