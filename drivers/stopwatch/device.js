'use strict';

const Homey = require('homey');
const { ChronographType } = require('../../lib/utils.js');
const Device = require('../../lib/device.js');

class StopwatchDevice extends Device {
	getStartCards() {
		return this.homey.settings.get('stopwatch_start_cards') || [];
	}

	getResumeCards() {
		return this.homey.settings.get('stopwatch_resume_cards') || [];
	}

	getChronographType() {
		return ChronographType.STOPWATCH;
	}
}

module.exports = StopwatchDevice;
