function convertUnixTimestampToDate(unix_timestamp) {
	return new Date(Number(unix_timestamp) * 1000);
}

module.exports = convertUnixTimestampToDate