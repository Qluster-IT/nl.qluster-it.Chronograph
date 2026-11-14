const { ChronographTrigger, toSeconds } = require('../../flow-cards.js');
const { ChronographType } = require('../../utils.js');

class TimerStarted extends ChronographTrigger {
	constructor(triggerId, homey) {
		super(triggerId, homey, ChronographType.TIMER);
		this.listen('started', chronograph => this.fire(chronograph, { seconds: toSeconds(chronograph.getTargetDuration()) }));
	}
}

module.exports = TimerStarted;
