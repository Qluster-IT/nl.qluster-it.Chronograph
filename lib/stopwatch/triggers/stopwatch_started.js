const { ChronographTrigger } = require('../../flow-cards.js');
const { ChronographType } = require('../../utils.js');

class StopwatchStarted extends ChronographTrigger {
	constructor(triggerId, homey) {
		super(triggerId, homey, ChronographType.STOPWATCH);
		this.listen('started', chronograph => this.fire(chronograph));
	}
}

module.exports = StopwatchStarted;
