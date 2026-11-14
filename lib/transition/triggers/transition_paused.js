const { ChronographTrigger, toSeconds } = require('../../flow-cards.js');
const { ChronographType } = require('../../utils.js');

class TransitionPaused extends ChronographTrigger {
	constructor(triggerId, homey) {
		super(triggerId, homey, ChronographType.TRANSITION);
		this.listen('paused', chronograph => this.fire(chronograph, { seconds: toSeconds(chronograph.getDuration()) }));
	}
}

module.exports = TransitionPaused;
