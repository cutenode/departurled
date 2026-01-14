const buildRadius = require('./src/buildRadius')
const getConfigData = require('./src/getConfigData')
const urls = require('./src/urls.js')
const prettifyUpdate = require('./src/prettifyUpdate')
const convertUnixTimestampToDate = require('./src/convertUnixTimestampToDate')
const protoBundle = require('./src/proto_bundle')

const configData = getConfigData('./departurled.json')

async function fetchTrainData(trainUrls, filteredStops) {
		try {
			const filteredStopTimeUpdates = []
			for (const trainUrl in trainUrls) {
				const response = await fetch(trainUrls[trainUrl]);

				if (!response.ok) {
						throw new Error(`HTTP error! status: ${response.status}`);
				}

				const buffer = await response.arrayBuffer();
				
				// Use the FeedMessage type from your compiled bundle
				const FeedMessage = protoBundle.transit_realtime.FeedMessage;
				const message = FeedMessage.decode(new Uint8Array(buffer)).entity;

			  for (const entity in message) {
					if (message[entity].tripUpdate) {
						const tripId = message[entity].tripUpdate.trip.tripId
						const routeId = message[entity].tripUpdate.trip.routeId
						const updates = message[entity].tripUpdate.stopTimeUpdate

						updates.forEach((update) => {
							const stop = filteredStops.find((filteredStop) => update.stopId.includes(filteredStop.stop_id))

							if (filteredStops.some((filteredStop) => update.stopId.includes(filteredStop.stop_id))) {
								const input = {
										routeId: routeId,
										stopId: update.stopId,
										stopName: stop.stop_name,
										arrivalTime: update.arrival.time,
										departureTime: update.departure.time,
										reachable: convertUnixTimestampToDate(update.arrival.time) >= new Date(new Date().getTime() + (configData.bufferMinutes + stop.minutesTo) * 60000)
									}
								
								const output = prettifyUpdate(input)

								filteredStopTimeUpdates.push(output)
							}							
						});
					}
				}
			return filteredStopTimeUpdates
		}
	} catch (err) {
		throw new Error(err)
	}
}


async function logger() {
	const stopsInRange = await buildRadius(configData)
	const filteredStopTimeUpdates = await fetchTrainData(urls, stopsInRange)
	const stopTimeUpdatesGroupedByStation = Object.groupBy(filteredStopTimeUpdates, (stopTimeUpdate) => {
		return stopTimeUpdate.stopName
	})

	// Add distance to grouped station
	// this is only in the temporary logger output, we should hoist it up to the actual output
	Object.keys(stopTimeUpdatesGroupedByStation).forEach(function(stationName, index) {
		stopTimeUpdatesGroupedByStation[stationName] = {
			stopTimeUpdates: stopTimeUpdatesGroupedByStation[stationName],
			minutesTo: stopsInRange.find((stop) => stop.stop_name === stationName).distance / configData.walkingSpeed
		};
	});

	// Current time + buffer + minutesTo

	console.log(JSON.stringify(stopTimeUpdatesGroupedByStation, null, 2))
}

logger()

// Google Maps walking speed
// 3 mi/hr ~= 80.47 m/min

// { stationName: { distance: ###, lines: { lineName: { uptown: [{}], downtown: [...] } } }}