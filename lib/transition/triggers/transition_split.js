const { ChronographTrigger, toSeconds } = require('../../flow-cards.js');
const { ChronographType } = require('../../utils.js');

class TransitionSplit extends ChronographTrigger {
	constructor(triggerId, homey) {
		super(triggerId, homey, ChronographType.TRANSITION);
		for (const event of ['started', 'split', 'finished']) {
			this.listen(event, transition => {
				// 'started' is emitted after the start and may already have a duration; the first value must be exactly 'from'.
				const duration = event == 'started' ? 0 : transition.getDuration();
				const perc = (1 / transition.getTargetDuration()) * duration;
				const from = transition.getData('from');
				this.fire(transition, {
					seconds: toSeconds(transition.getDuration()),
					value: parseFloat((from + (perc * (transition.getData('to') - from))).toFixed(2)),
					first: event == 'started',
					last: event == 'finished'
				});
			});
		}
	}
}

module.exports = TransitionSplit;
