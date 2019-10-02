#!/usr/bin/env node
'use strict'

const Configstore = require('configstore')
const meow = require('meow')
const axios = require('axios')
const opn = require('opn')
const Table = require('cli-table3')

const grid = new Table()
const ora = require('ora')
const chalk = require('chalk')
const pkg = require('./package.json')

const conf = new Configstore(pkg.name, {
	apikey: '',
	lang: 'tr',
	units: 'si',
	lat: '41.041512',
	lon: '29.003836',
	table: {
		showTemperature: true,
		showPrecip: true,
		showPressure: true,
		showWind: true,
		showClouds: true,
		showUV: true,
		showSummary: true,
	},
	localization: {
		en: {
			name: 'English',
			days: [
				'Sunday',
				'Monday',
				'Tuesday',
				'Wednesday',
				'Thursday',
				'Friday',
				'Saturday',
			],
			ui: {
				temperature: 'Temperature',
				current: 'Current',
				currentDay: 'Today',
				precipation: 'Precip',
				pressure: 'Pressure',
				wind: 'Wind',
				clouds: 'Clouds',
				uv: 'UV',
				summary: 'Summary',
			},
			precipType: {
				rain: 'Rain',
				snow: 'Snow',
				sleet: 'Sleet',
			},
		},
		tr: {
			name: 'Türkçe',
			current: 'Şu An',
			currentDay: 'Bugün',
			days: [
				'Pazar',
				'Pazartesi',
				'Salı',
				'Çarşamba',
				'Perşembe',
				'Cuma',
				'Cumartesi',
			],
			ui: {
				temperature: 'Derece',
				precipation: 'Tahmin',
				pressure: 'Basınç',
				wind: 'Rüzgar',
				clouds: 'Bulut',
				uv: 'UV',
				summary: 'Sonuç',
			},
			precipType: {
				rain: 'Yağmur',
				snow: 'Kar',
				sleet: 'Sulu Kar',
			},
		},
	},
})

const weekday = conf.get('localization.' + conf.get('lang') + '.days')

const cli = meow(
	`
	Usage
		$ ds <input>

	Options
		--current  -c  Show current weather
		--daily    -d  Show daily weather
		--weekly   -w  Show weekly weather

		--add      -a  Add new location
		--get      -g  Get saved location
		--remove   -r  Remove saved location

		--settings -s  Show settings
		--help     -h  Show help
`,
	{
		flags: {
			current: { alias: 'c' },
			daily: { alias: 'd' },
			weekly: { alias: 'w' },
			add: { alias: 'a' },
			get: { alias: 'g' },
			remove: { alias: 'r' },
			settings: { alias: 's' },
			help: { alias: 'h' },
		},
	}
)

if (cli.flags.s) {
	console.log('Opening settings file: ' + chalk.magenta.bold(conf.path))
	opn(conf.path, { wait: false })
} else {
	fecthWeather()
}

function fecthWeather() {
	let exclude = ''
	let spinner = ora()

	if (cli.flags.c) {
		exclude = '&exclude=hourly,minutely,daily,weekly,flags,alerts'
		spinner = ora('Fetching DarkSky For Current Weather').start()
	} else if (cli.flags.d) {
		exclude = '&exclude=daily,minutely,flags,alerts'
		spinner = ora('Fetching DarkSky For Daily Weather').start()
	} else if (cli.flags.w) {
		exclude = '&exclude=hourly,minutely,currently,flags,alerts'
		spinner = ora('Fetching DarkSky For Weekly Weather').start()
	}

	const request =
		'https://api.darksky.net/forecast/' +
		conf.get('apikey') +
		'/' +
		conf.get('lat') +
		',' +
		conf.get('lon') +
		'?lang=' +
		conf.get('lang') +
		'&units=' +
		conf.get('units') +
		exclude
	axios
		.get(request)
		.then(response => {
			spinner.succeed('Fetching DarkSky Data Succeeded')
			writeWeather(response.data)
		})
		.catch(error => {
			spinner.fail('Error Fetching DarkSky Data')
			console.log(error)
		})
}

function writeWeather(response) {
	// Set Title
	grid.push([
		chalk.green.bold(response.timezone),
		chalk.green.bold(getLocalization('ui', 'temperature')),
		chalk.green.bold(getLocalization('ui', 'precipation')),
		chalk.green.bold(getLocalization('ui', 'pressure')),
		chalk.green.bold(getLocalization('ui', 'wind')),
		chalk.green.bold(getLocalization('ui', 'clouds')),
		chalk.green.bold(getLocalization('ui', 'uv')),
		chalk.green.bold(getLocalization('ui', 'summary')),
	])

	if (cli.flags.c) {
		pushData(response.currently, response.currently)
	} else if (cli.flags.d) {
		for (let index = 0; index < 25; index++) {
			const day = response.hourly.data[index]
			const previousDay =
				index === 0 ? day : response.hourly.data[index - 1]
			pushData(day, previousDay)
		}
	} else if (cli.flags.w) {
		for (let index = 0; index < response.daily.data.length; index++) {
			const day = response.daily.data[index]
			const previousDay =
				index === 0 ? day : response.daily.data[index - 1]
			pushData(day, previousDay)
		}
	}

	console.log(grid.toString())
}

function pushData(day, previousDay) {
	grid.push([
		getDayName(day.time),
		getTemperature(day),
		getPrecip(day),
		getPressure(day.pressure, previousDay.pressure),
		getWind(day.windSpeed, day.windBearing),
		getClouds(day.cloudCover),
		getUV(day.uvIndex),
		day.summary,
	])
}

function getDayName(time) {
	const d = new Date(time * 1000)

	if (cli.flags.c) {
		return chalk.green.bold(
			conf.get('localization.' + conf.get('lang') + '.current')
		)
	}

	if (cli.flags.d) {
		return chalk.green.bold(
			pad(d.getHours(), '0') + ':' + pad(d.getMinutes(), '0')
		)
	}

	return chalk.green.bold(weekday[d.getDay()])
}

function getTemperature(day) {
	if (cli.flags.w) {
		return (
			formatTemperature(day.temperatureMin) +
			' - ' +
			formatTemperature(day.temperatureMax)
		)
	}

	return formatTemperature(day.temperature)
}

function getPrecip(day) {
	if (day.precipProbability === 0) return ''

	let precipType

	const precipProbability = pad(round(day.precipProbability * 100), ' ')

	if (precipProbability >= 25) {
		if (day.precipType === 'rain')
			precipType = chalk.blue(
				'(' + getLocalization('precipType', day.precipType) + ')'
			)
		else if (day.precipType === 'sleet')
			precipType = chalk.cyan(
				'(' + getLocalization('precipType', day.precipType) + ')'
			)
		else if (day.precipType === 'snow')
			precipType = chalk.white(
				'(' + getLocalization('precipType', day.precipType) + ')'
			)
	} else {
		precipType = '(' + getLocalization('precipType', day.precipType) + ')'
	}

	return precipProbability + '% ' + precipType
}

function getPressure(pressure, prevPressure) {
	if (pressure > prevPressure)
		return chalk.red('↑ ') + round(pressure) + ' hPa'
	if (pressure < prevPressure)
		return chalk.blue('↓ ') + round(pressure) + ' hPa'

	return '• ' + round(pressure) + ' hPa'
}

function getWind(speed, bearing) {
	if (bearing >= 292.5 && bearing < 337.5) return '↘ ' + speed + ' kph'
	if (bearing >= 247.5 && bearing < 292.5) return '→ ' + speed + ' kph'
	if (bearing >= 202.5 && bearing < 247.5) return '↗ ' + speed + ' kph'
	if (bearing >= 157.5 && bearing < 202.5) return '↑ ' + speed + ' kph'
	if (bearing >= 112.5 && bearing < 157.5) return '↖ ' + speed + ' kph'
	if (bearing >= 67.5 && bearing < 112.5) return '← ' + speed + ' kph'
	if (bearing >= 22.5 && bearing < 67.5) return '↙ ' + speed + ' kph'
	if (bearing > 337.5 && bearing < 22.5) return '↓ ' + speed + ' kph'

	return ''
}

function getClouds(cloudCoverage) {
	return pad(round(cloudCoverage * 100), ' ') + '%'
}

function getUV(uv) {
	if (uv <= 2) return chalk.hex('#6bbf30')(uv)
	if (uv >= 3 && uv < 5) return chalk.hex('#ffd208')(uv)
	if (uv >= 5 && uv < 7) return chalk.hex('#ffae00')(uv)
	if (uv >= 7 && uv < 10) return chalk.hex('#ea3447')(uv)
	if (uv >= 10) return chalk.hex('#a44c6f')(uv)
	return uv
}

function formatTemperature(temp) {
	temp = round(temp)

	if (temp <= 0) return chalk.cyan(temp + '°c')
	if (temp >= 1 && temp < 10) return chalk.cyan(temp + '°c')
	if (temp >= 10 && temp < 15) return chalk.blue(temp + '°c')
	if (temp >= 15 && temp < 20) return chalk.white(temp + '°c')
	if (temp >= 20 && temp < 25) return chalk.white(temp + '°c')
	if (temp >= 25 && temp < 30) return chalk.yellow(temp + '°c')
	if (temp >= 30) return chalk.red(temp + '°c')
	return temp + '°c'
}

function round(number) {
	const value = (number * 2).toFixed() / 2
	return value.toFixed()
}

function pad(num, add) {
	return (add + num).slice(-2)
}

function getLocalization(root, key) {
	return conf.get('localization.' + conf.get('lang') + '.' + root + '.' + key)
}
