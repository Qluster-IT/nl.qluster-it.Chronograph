const TimerSplit = require('./timer_split.js');

class TimerElapsed extends TimerSplit {
	constructor(triggerId, homey) {
		super(triggerId, homey, 'timer_elapsed_splits', 'elapsed');
	}
}

module.exports = TimerElapsed;
