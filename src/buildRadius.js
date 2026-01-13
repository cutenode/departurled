
const getStops = require('./getStops')
const calculateRadius = require('./calculateRadius')

// get radius from current location
async function buildRadius (configData) {
	const stops = await getStops()
	const locationLat = Number(configData.location.latitude)
	const locationLon = Number(configData.location.longitude)

	const stopsInRange = []

	for (const stop of stops) {
		if(stop.parent_station === '') {
			const stopLat = Number(stop.stop_lat)
			const stopLon = Number(stop.stop_lon)
			const distance = calculateRadius(locationLat, locationLon, stopLat, stopLon)

			if (distance <= 1000) {
				stopsInRange.push({ ...stop, distance: distance, minutesTo: distance / configData.walkingSpeed })
			}
		}
	}

	return stopsInRange
}

module.exports = buildRadius