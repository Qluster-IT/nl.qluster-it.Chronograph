const { ChronographTrigger, toSeconds } = require('../../flow-cards.js');
const { ChronographType } = require('../../utils.js');

class TransitionStarted extends ChronographTrigger {
	constructor(triggerId, homey) {
		super(triggerId, homey, ChronographType.TRANSITION);
		this.listen('started', chronograph => this.fire(chronograph, { seconds: toSeconds(chronograph.getTargetDuration()) }));
	}
}

module.exports = TransitionStarted;
