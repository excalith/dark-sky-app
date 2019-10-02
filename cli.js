#!/usr/bin/env node
'use strict';
const Configstore = require('configstore');
const meow = require('meow');
const axios = require('axios');
const opn = require('opn');
const inquirer = require('inquirer');
const Table = require('cli-table3');
const grid = new Table();
const ora = require('ora');
const chalk = require('chalk');
const pkg = require('./package.json');

const conf = new Configstore(pkg.name, {
	apikey: '',
	lang: 'tr',
	units: 'si',
	current: '',
	cities: {},
});

const weekday = [
	'Sunday',
	'Monday',
	'Tuesday',
	'Wednesday',
	'Thursday',
	'Friday',
	'Saturday',
];

const cli = meow(
	`
	Usage
		$ ds <input>

	Options
		--current  -c  Show current weather
		--today    -t  Show todays weather
		--week     -w  Show weekly weather

		--add      -a  Add new location
		--get      -g  Get saved location
		--delete   -d  Delete saved location

		--settings -s  Show Settings JSON
		--help     -h  Show help
`,
	{
		flags: {
			current: { alias: 'c' },
			today: { alias: 't' },
			week: { alias: 'w' },
			add: { alias: 'a' },
			get: { alias: 'g' },
			delete: { alias: 'd' },
			settings: { alias: 's' },
			help: { alias: 'h' },
		},
	}
);

/* CHECK API KEY AND INPUT */
if (conf.get('apikey') === '') {
	addAPIKey();
} else {
	checkInput();
}

/* API KEY SET */
function addAPIKey() {
	ora('You need DarkSky API Key to continue').fail();
	ora('You can get one free from https://darksky.net/dev\n').info();

	inquirer
		.prompt([
			{
				message: 'DarkSky API Key',
				type: 'input',
				name: 'key',
			},
		])
		.then(answers => {
			conf.set('apikey', answers.key);
		});
}

/* INPUT FLAGS */
function checkInput() {
	if (cli.flags.a) {
		addCity();
	} else if (cli.flags.g) {
		const cities = conf.get('cities');
		const cityCount = Object.keys(cities).length;
		if (cityCount === 0) {
			ora('No localiton registered. Please add a localiton first').fail();
			return;
		}

		getCities(cities);
	} else if (cli.flags.d) {
		const cities = conf.get('cities');

		const cityCount = Object.keys(cities).length;
		if (cityCount === 0) {
			ora('No location registered to delete').fail();
			return;
		}

		removeCity(cities);
	} else if (cli.flags.s) {
		console.log('Opening settings file: ' + chalk.magenta.bold(conf.path));
		opn(conf.path, { wait: false });
	} else {
		if (conf.get('current') === '') {
			ora('Please select a location first').fail();
			return;
		}

		fecthWeather();
	}
}

/* SETTINGS */
function addCity() {
	inquirer
		.prompt([
			{
				message: 'City Name:',
				type: 'input',
				name: 'name',
			},
			{
				message: 'Latitude:',
				type: 'input',
				name: 'lat',
			},
			{
				message: 'Longitude',
				type: 'input',
				name: 'lon',
			},
			{
				message: 'Are your choices correct?',
				type: 'list',
				name: 'isConfirmed',
				choices: ['Yes', 'No'],
			},
		])
		.then(answers => {
			if (answers.isConfirmed === 'No') {
				addCity();
			} else {
				conf.set('cities.' + answers.name + '.lat', answers.lat);
				conf.set('cities.' + answers.name + '.lon', answers.lon);
				conf.set('current', answers.name);
			}
		});
}

function getCities(cities) {
	inquirer
		.prompt([
			{
				message: 'Switch to a city',
				type: 'list',
				name: 'cityName',
				choices: Object.keys(cities),
			},
		])
		.then(answers => {
			conf.set('current', answers.cityName);
		});
}

function removeCity(cities) {
	inquirer
		.prompt([
			{
				message: 'Delete a city',
				type: 'list',
				name: 'cityName',
				choices: Object.keys(cities),
			},
		])
		.then(answers => {
			conf.set('current', '');
			conf.delete('cities.' + answers.cityName);
		});
}

/* FETCH AND WRITE WEATHER */
function fecthWeather() {
	let exclude = '';
	let spinner = ora();

	if (cli.flags.c) {
		exclude = '&exclude=hourly,minutely,daily,weekly,flags,alerts';
		spinner = ora('Fetching DarkSky For Current Weather').start();
	} else if (cli.flags.t) {
		exclude = '&exclude=daily,minutely,flags,alerts';
		spinner = ora('Fetching DarkSky For Daily Weather').start();
	} else if (cli.flags.w) {
		exclude = '&exclude=hourly,minutely,currently,flags,alerts';
		spinner = ora('Fetching DarkSky For Weekly Weather').start();
	}

	const cityName = conf.get('current');
	const cityData = conf.get('cities.' + cityName);

	const request =
		'https://api.darksky.net/forecast/' +
		conf.get('apikey') +
		'/' +
		cityData.lat +
		',' +
		cityData.lon +
		'?lang=' +
		conf.get('lang') +
		'&units=' +
		conf.get('units') +
		exclude;
	axios
		.get(request)
		.then(response => {
			spinner.succeed('Fetching DarkSky Data Succeeded');
			writeWeather(response.data, cityName);
		})
		.catch(error => {
			spinner.fail('Error Fetching DarkSky Data');
			console.log(error);
		});
}

function writeWeather(response, cityName) {
	// Set Title
	grid.push([
		chalk.green.bold(cityName),
		chalk.green.bold('Temperature'),
		chalk.green.bold('Precipation'),
		chalk.green.bold('Pressure'),
		chalk.green.bold('Wind'),
		chalk.green.bold('Clouds'),
		chalk.green.bold('UV'),
		chalk.green.bold('Summary'),
	]);

	if (cli.flags.c) {
		pushData(response.currently, response.currently);
	} else if (cli.flags.d) {
		for (let index = 0; index < 25; index++) {
			const day = response.hourly.data[index];
			const previousDay =
				index === 0 ? day : response.hourly.data[index - 1];
			pushData(day, previousDay);
		}
	} else if (cli.flags.w) {
		for (let index = 0; index < response.daily.data.length; index++) {
			const day = response.daily.data[index];
			const previousDay =
				index === 0 ? day : response.daily.data[index - 1];
			pushData(day, previousDay);
		}
	}

	console.log(grid.toString());
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
	]);
}

/* GET FUNCTIONS */
function getDayName(time) {
	const d = new Date(time * 1000);

	if (cli.flags.c) {
		return chalk.green.bold('Current');
	}

	if (cli.flags.d) {
		return chalk.green.bold(
			pad(d.getHours(), '0') + ':' + pad(d.getMinutes(), '0')
		);
	}

	return chalk.green.bold(weekday[d.getDay()]);
}

function getTemperature(day) {
	if (cli.flags.w) {
		return (
			formatTemperature(day.temperatureMin) +
			' - ' +
			formatTemperature(day.temperatureMax)
		);
	}

	return formatTemperature(day.temperature);
}

function getPrecip(day) {
	if (day.precipProbability === 0) return '';

	let precipType;

	const precipProbability = pad(round(day.precipProbability * 100), ' ');
	const shouldColorize = precipProbability >= 25;
	if (day.precipType === 'rain') {
		precipType = shouldColorize
			? (precipType = chalk.blue('(Rain)'))
			: '(Rain)';
	} else if (day.precipType === 'sleet') {
		precipType = shouldColorize
			? (precipType = chalk.blue('(Sleet)'))
			: '(Sleet)';
	} else if (day.precipType === 'snow') {
		precipType = shouldColorize
			? (precipType = chalk.blue('(Snow)'))
			: '(Snow)';
	}

	return precipProbability + '% ' + precipType;
}

function getPressure(pressure, prevPressure) {
	if (pressure > prevPressure)
		return chalk.red('↑ ') + round(pressure) + ' hPa';
	if (pressure < prevPressure)
		return chalk.blue('↓ ') + round(pressure) + ' hPa';

	return '• ' + round(pressure) + ' hPa';
}

function getWind(speed, bearing) {
	if (bearing >= 292.5 && bearing < 337.5) return '↘ ' + speed + ' kph';
	if (bearing >= 247.5 && bearing < 292.5) return '→ ' + speed + ' kph';
	if (bearing >= 202.5 && bearing < 247.5) return '↗ ' + speed + ' kph';
	if (bearing >= 157.5 && bearing < 202.5) return '↑ ' + speed + ' kph';
	if (bearing >= 112.5 && bearing < 157.5) return '↖ ' + speed + ' kph';
	if (bearing >= 67.5 && bearing < 112.5) return '← ' + speed + ' kph';
	if (bearing >= 22.5 && bearing < 67.5) return '↙ ' + speed + ' kph';
	if (bearing > 337.5 && bearing < 22.5) return '↓ ' + speed + ' kph';

	return '';
}

function getClouds(cloudCoverage) {
	return pad(round(cloudCoverage * 100), ' ') + '%';
}

function getUV(uv) {
	if (uv <= 2) return chalk.hex('#6bbf30')(uv);
	if (uv >= 3 && uv < 5) return chalk.hex('#ffd208')(uv);
	if (uv >= 5 && uv < 7) return chalk.hex('#ffae00')(uv);
	if (uv >= 7 && uv < 10) return chalk.hex('#ea3447')(uv);
	if (uv >= 10) return chalk.hex('#a44c6f')(uv);
	return uv;
}

/* FORMAT HELPERS */
function formatTemperature(temp) {
	temp = round(temp);

	if (temp <= 0) return chalk.cyan(temp + '°c');
	if (temp >= 1 && temp < 10) return chalk.cyan(temp + '°c');
	if (temp >= 10 && temp < 15) return chalk.blue(temp + '°c');
	if (temp >= 15 && temp < 20) return chalk.white(temp + '°c');
	if (temp >= 20 && temp < 25) return chalk.white(temp + '°c');
	if (temp >= 25 && temp < 30) return chalk.yellow(temp + '°c');
	if (temp >= 30) return chalk.red(temp + '°c');
	return temp + '°c';
}

function round(number) {
	const value = (number * 2).toFixed() / 2;
	return value.toFixed();
}

function pad(num, add) {
	return (add + num).slice(-2);
}
