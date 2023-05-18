const Homey = require('homey');
const Chronograph = require('../../chronograph.js');
const { Utils, ChronographType } = require('../../utils.js');

class StopwatchPause { 
	constructor(actionId, homey) {
		//super(actionId);

		
this.homey=homey;
this.card = homey.flow.getActionCard(actionId);
		this.card.registerRunListener((args) => {
			let name = args.namedd ? args.namedd.name : args.name;
			if (name.includes('*')) {
				let regexp = Utils.wildcardToRegExp(name);
				Chronograph.all().forEach(chronograph => {
					if (
						chronograph.getData('type') == ChronographType.STOPWATCH
						&& regexp.test(chronograph.getName())
					) {
						chronograph.pause();
					}
				});

				return Promise.resolve(true);
			} else {
				let id = Utils.generateId(ChronographType.STOPWATCH, name);
				let stopwatch = Chronograph.get(id);
				if (!!stopwatch) {
					stopwatch.pause();
					return Promise.resolve(true);
				}

				return Promise.reject(new Error(this.homey.__("stopwatch_not_running", { "name": name })));
			}
		});
	}
}

module.exports = StopwatchPause;
