const { ChronographTrigger, storeCardArguments } = require('../../flow-cards.js');
const { ChronographType } = require('../../utils.js');

class TransitionFinished extends ChronographTrigger {
	constructor(triggerId, homey) {
		super(triggerId, homey, ChronographType.TRANSITION);
		this.listen('finished', chronograph => this.fire(chronograph));
		this._storeCards = storeCardArguments(this.card, homey, 'transition_trigger_cards', 'trigger_cards_updated');
		this._storeCards();
	}
}

module.exports = TransitionFinished;
