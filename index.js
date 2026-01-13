const csv = require('async-csv')
const { readFile } = require('node:fs/promises')
const { readFileSync } = require('node:fs')
const { resolve } = require('node:path');
const root = require("./sources/proto_bundle.js");

function getConfigData (configPath) {
	const resolvedConfigPath = resolve(configPath)
	const fileContents = readFileSync(resolvedConfigPath).toString()
	return JSON.parse(fileContents)
}

const configData = getConfigData('./departurled.json')

async function getStops () {
	const data = await readFile('./sources/stops.txt', 'utf-8')
	const stops = await csv.parse(data, { columns: true })
	return stops
}

// internal util to test getStops
// async function stopsLogger () {
// 	const data = await getStops()
// 	console.log(data)
// }

// stopsLogger()

function calculateRadius(lat1, lon1, lat2, lon2) {
	const R = 6371e3; // metres
	const φ1 = lat1 * Math.PI/180; // φ, λ in radians
	const φ2 = lat2 * Math.PI/180;
	const Δφ = (lat2-lat1) * Math.PI/180;
	const Δλ = (lon2-lon1) * Math.PI/180;

	const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
						Math.cos(φ1) * Math.cos(φ2) *
						Math.sin(Δλ/2) * Math.sin(Δλ/2);
	const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

	const d = R * c; // in metres
	return d
}
// get radius from current location
async function buildRadius (lat, lon) {
	const stops = await getStops()
	// should probably default to 0.5miles
	// lat and long can't follow basic trig
	const locationLat = Number(lat)
	const locationLon = Number(lon)

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
				const FeedMessage = root.transit_realtime.FeedMessage;
				const message = FeedMessage.decode(new Uint8Array(buffer));

			  for (const entity in message.entity) {
					if (message.entity[entity].tripUpdate) {
						const tripId = message.entity[entity].tripUpdate.trip.tripId;
						const routeId = message.entity[entity].tripUpdate.trip.routeId;

						message.entity[entity].tripUpdate.stopTimeUpdate.forEach((stopTimeUpdate) => {
							const stop = filteredStops.find((filteredStop) => stopTimeUpdate.stopId.includes(filteredStop.stop_id))
							if (
								filteredStops.some((filteredStop) => stopTimeUpdate.stopId.includes(filteredStop.stop_id))
							) {
								const result = stopTimeUpdateToDataBundle(
									{
										routeId: routeId,
										stopId: stopTimeUpdate.stopId,
										stopName: stop.stop_name,
										arrivalTime: stopTimeUpdate.arrival.time,
										departureTime: stopTimeUpdate.departure.time,
										reachable: convertUnixTimestampToDate(stopTimeUpdate.arrival.time) >= new Date(new Date().getTime() + (configData.bufferMinutes + stop.minutesTo) * 60000)
									}
								)
								filteredStopTimeUpdates.push(result)
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
	const stopsInRange = await buildRadius(configData.location.latitude, configData.location.longitude)
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