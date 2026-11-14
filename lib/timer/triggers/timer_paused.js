const { ChronographTrigger, toSeconds } = require('../../flow-cards.js');
const { ChronographType } = require('../../utils.js');

class TimerPaused extends ChronographTrigger {
	constructor(triggerId, homey) {
		super(triggerId, homey, ChronographType.TIMER);
		this.listen('paused', chronograph => this.fire(chronograph, { seconds: toSeconds(chronograph.getTargetDuration() - chronograph.getDuration()) }));
	}
}

module.exports = TimerPaused;
