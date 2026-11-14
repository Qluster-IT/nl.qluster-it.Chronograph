const { ChronographTrigger, toSeconds } = require('../../flow-cards.js');
const { ChronographType } = require('../../utils.js');

class TimerStopped extends ChronographTrigger {
	constructor(triggerId, homey) {
		super(triggerId, homey, ChronographType.TIMER);
		this.listen('stopped', chronograph => this.fire(chronograph, { seconds: toSeconds(chronograph.getTargetDuration() - chronograph.getDuration()) }));
	}
}

module.exports = TimerStopped;
