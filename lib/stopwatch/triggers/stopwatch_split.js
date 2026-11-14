const { ChronographTrigger, storeCardArguments } = require('../../flow-cards.js');
const { ChronographType } = require('../../utils.js');

class StopwatchSplit extends ChronographTrigger {
	constructor(triggerId, homey) {
		super(triggerId, homey, ChronographType.STOPWATCH, true);
		this.listen('split', (stopwatch, split) => this.fireSplit(stopwatch, split));
		storeCardArguments(this.card, homey, 'stopwatch_splits');
	}
}

module.exports = StopwatchSplit;
