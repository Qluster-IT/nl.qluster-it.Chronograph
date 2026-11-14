const { ChronographTrigger, toSeconds } = require('../../flow-cards.js');
const { ChronographType } = require('../../utils.js');

class StopwatchPaused extends ChronographTrigger {
	constructor(triggerId, homey) {
		super(triggerId, homey, ChronographType.STOPWATCH);
		this.listen('paused', chronograph => this.fire(chronograph, { seconds: toSeconds(chronograph.getDuration()) }));
	}
}

module.exports = StopwatchPaused;
