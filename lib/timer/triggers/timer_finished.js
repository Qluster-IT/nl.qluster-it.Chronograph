const { ChronographTrigger, storeCardArguments } = require('../../flow-cards.js');
const { ChronographType } = require('../../utils.js');

class TimerFinished extends ChronographTrigger {
	constructor(triggerId, homey) {
		super(triggerId, homey, ChronographType.TIMER);
		this.listen('finished', chronograph => this.fire(chronograph));
		this._storeCards = storeCardArguments(this.card, homey, 'timer_trigger_cards', 'trigger_cards_updated');
		this._storeCards();
	}
}

module.exports = TimerFinished;
