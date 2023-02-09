'use strict';

const Homey = require('homey');
const { ChronographType } = require('../../lib/utils.js');
const Driver = require('../../lib/driver.js');

class StopwatchDriver extends Driver {
	getStartCards() {
		return this.homey.settings.get('stopwatch_start_cards') || [];
	}

	getResumeCards() {
		return this.homey.settings.get('stopwatch_resume_cards') || [];
	}

	getTriggerCards() {
		return this.homey.settings.get('stopwatch_trigger_cards') || [];
	}
	
	getChronographType() {
		return ChronographType.STOPWATCH;
	}
}

module.exports = StopwatchDriver;
