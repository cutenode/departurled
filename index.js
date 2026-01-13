const csv = require('async-csv')
const { readFile } = require('node:fs/promises')
const { readFileSync } = require('node:fs')
const { resolve } = require('node:path');
const root = require("./sources/proto_bundle.js");

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
				stopsInRange.push(stop)
			}
		}
	}

	return stopsInRange
}

function getConfigData (configPath) {
	const resolvedConfigPath = resolve(configPath)
	const fileContents = readFileSync(resolvedConfigPath).toString()
	return JSON.parse(fileContents)
}

const data = getConfigData('./departurled.json')

const MTA_TRAIN_URLS = [
	'https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs-ace',
	'https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs-g',
	'https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs-nqrw',
	'https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs',
	'https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs-bdfm',
	'https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs-jz',
	'https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2Fgtfs-l'
]

function stopTimeUpdateToDataBundle({ stopId, routeId, arrivalTime, departureTime }) {
	return {
		stopId: stopId,
		routeId: routeId,
		arrivalTime: convertUnixTimestampToDate(arrivalTime),
		departureTime: convertUnixTimestampToDate(departureTime),
		direction: stopId[stopId.length - 1].includes('S') ? 'downtown' : 'uptown'
	}
}

function convertUnixTimestampToDate(unix_timestamp) {
	return new Date(Number(unix_timestamp) * 1000);
}

async function fetchTrainData(trainUrls, filteredStops) {
		try {
			const filteredStopTimeUpdates = []
			trainUrls.forEach(async (trainUrl) => {
				const response = await fetch(trainUrl);

				if (!response.ok) {
						throw new Error(`HTTP error! status: ${response.status}`);
				}

				const buffer = await response.arrayBuffer();
				
				// Use the FeedMessage type from your compiled bundle
				const FeedMessage = root.transit_realtime.FeedMessage;
				const message = FeedMessage.decode(new Uint8Array(buffer));

			  message.entity.forEach((entity) => {
					if (entity.tripUpdate) {
						const tripId = entity.tripUpdate.trip.tripId;
						const routeId = entity.tripUpdate.trip.routeId;

						entity.tripUpdate.stopTimeUpdate.forEach((stopTimeUpdate) => {
							if (filteredStops.some((filteredStop) => stopTimeUpdate.stopId.includes(filteredStop.stop_id))) {
								filteredStopTimeUpdates.push(stopTimeUpdateToDataBundle(
									{
										routeId: routeId,
										stopId: stopTimeUpdate.stopId,
										arrivalTime: stopTimeUpdate.arrival.time,
										departureTime: stopTimeUpdate.departure.time
									}
								))
							}
						});
					}
				})
			})

			return filteredStopTimeUpdates
		} catch (error) {
				console.error("Failed to decode MTA data:", error);
		}
}

async function logger() {
	const stopsInRange = await buildRadius(data.location.latitude, data.location.longitude)
	const filteredStopTimeUpdates = await fetchTrainData(MTA_TRAIN_URLS, stopsInRange)
	console.log(filteredStopTimeUpdates)
}

logger()

// console.log(getConfigData('./departurled.json'))