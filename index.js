const buildRadius = require('./src/buildRadius.js')
const getConfigData = require('./src/getConfigData')
const protoBundle = require('./src/proto_bundle.js')

const configData = getConfigData('./departurled.json')

const MTA_TRAIN_URLS = [
	'https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs-ace',
	'https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs-g',
	'https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs-nqrw',
	'https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs',
	'https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs-bdfm',
	'https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs-jz',
	'https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs-l'
]

function stopTimeUpdateToDataBundle({ stopId, stopName, routeId, arrivalTime, departureTime, reachable }) {
	return {
		stopId: stopId,
		stopName: stopName,
		routeId: routeId,
		arrivalTime: convertUnixTimestampToDate(arrivalTime),
		departureTime: convertUnixTimestampToDate(departureTime),
		direction: stopId[stopId.length - 1].includes('S') ? 'downtown' : 'uptown',
		reachable
	}
}

function convertUnixTimestampToDate(unix_timestamp) {
	return new Date(Number(unix_timestamp) * 1000);
}

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
						const tripId = message[entity].tripUpdate.trip.tripId;
						const routeId = message[entity].tripUpdate.trip.routeId;

						message[entity].tripUpdate.stopTimeUpdate.forEach((stopTimeUpdate) => {
							const stop = filteredStops.find((filteredStop) => stopTimeUpdate.stopId.includes(filteredStop.stop_id))
							if (filteredStops.some((filteredStop) => stopTimeUpdate.stopId.includes(filteredStop.stop_id))) {
								const input = {
										routeId: routeId,
										stopId: stopTimeUpdate.stopId,
										stopName: stop.stop_name,
										arrivalTime: stopTimeUpdate.arrival.time,
										departureTime: stopTimeUpdate.departure.time,
										reachable: convertUnixTimestampToDate(stopTimeUpdate.arrival.time) >= new Date(new Date().getTime() + (configData.bufferMinutes + stop.minutesTo) * 60000)
									}
								
								const output = stopTimeUpdateToDataBundle(input)
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
	const filteredStopTimeUpdates = await fetchTrainData(MTA_TRAIN_URLS, stopsInRange)
	const stopTimeUpdatesGroupedByStation = Object.groupBy(filteredStopTimeUpdates, (stopTimeUpdate) => {
		return stopTimeUpdate.stopName
	})

	// Add distance to grouped station
	Object.keys(stopTimeUpdatesGroupedByStation).forEach(function(stationName, index) {
		stopTimeUpdatesGroupedByStation[stationName] = {
			stopTimeUpdates: stopTimeUpdatesGroupedByStation[stationName],
			minutesTo: stopsInRange.find((stop) => stop.stop_name === stationName).distance / configData.walkingSpeed
		};
	});

	// Current time + buffer + minutesTo

	console.log(JSON.stringify(stopTimeUpdatesGroupedByStation))
}

logger()

// Google Maps walking speed
// 3 mi/hr ~= 80.47 m/min

// { stationName: { distance: ###, lines: { lineName: { uptown: [{}], downtown: [...] } } }}