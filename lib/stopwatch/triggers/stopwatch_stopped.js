const { ChronographTrigger, storeCardArguments, toSeconds } = require('../../flow-cards.js');
const { ChronographType } = require('../../utils.js');

class StopwatchStopped extends ChronographTrigger {
	constructor(triggerId, homey) {
		super(triggerId, homey, ChronographType.STOPWATCH);
		this.listen('stopped', chronograph => this.fire(chronograph, { seconds: toSeconds(chronograph.getDuration()) }));
		this._storeCards = storeCardArguments(this.card, homey, 'stopwatch_trigger_cards', 'trigger_cards_updated');
		this._storeCards();
	}
}

module.exports = StopwatchStopped;
