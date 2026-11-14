const { ChronographTrigger, storeCardArguments } = require('../../flow-cards.js');
const { ChronographType } = require('../../utils.js');

class TimerSplit extends ChronographTrigger {
	constructor(triggerId, homey, settingName = 'timer_splits', splitType = 'remaining') {
		super(triggerId, homey, ChronographType.TIMER, true);
		this.listen('split', (timer, split) => {
			if (split.data && (split.data.timerSplitType || 'remaining') === splitType) this.fireSplit(timer, split);
		});
		storeCardArguments(this.card, homey, settingName);
	}
}

module.exports = TimerSplit;
