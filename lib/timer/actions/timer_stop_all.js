const Homey = require('homey');
const Chronograph = require('../../chronograph.js');
const { ChronographType } = require('../../utils.js');

class TimerStopAll { 
	constructor(actionId, homey) {
		//super(actionId);

		
this.homey=homey;
this.card = homey.flow.getActionCard(actionId);
		this.card.registerRunListener((args) => {
			Chronograph.all().forEach(chronograph => {
				if (chronograph.getData('type') == ChronographType.TIMER) {
					chronograph.stop();
				}
			});

			return Promise.resolve(true);
		});
	}
}

module.exports = TimerStopAll;
