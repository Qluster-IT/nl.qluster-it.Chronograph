'use strict';

const Homey = require('homey');
const { ChronographType } = require('../../lib/utils.js');
const Driver = require('../../lib/driver.js');

class TransitionDriver extends Driver {
	getStartCards() {
		return this.homey.settings.get('transition_start_cards') || [];
	}

	getResumeCards() {
		return this.homey.settings.get('transition_resume_cards') || [];
	}

	getTriggerCards() {
		return this.homey.settings.get('transition_trigger_cards') || [];
	}

	getChronographType() {
		return ChronographType.TRANSITION;
	}
}

module.exports = TransitionDriver;
