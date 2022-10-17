const Homey = require('homey');
const Chronograph = require('../../chronograph.js');
const { Utils, ChronographType } = require('../../utils.js');

class StopwatchAdjust { 
	constructor(actionId, homey) {
		//super(actionId);

		
this.homey=homey;
this.card = homey.flow.getActionCard(actionId);
		this.card.registerRunListener((args) => {
			let time = Utils.evalTime(args.time);
			if (isNaN(time)) {
				return Promise.reject(new Error(this.homey.__("invalid_duration")));
			}

			if (args.name.includes('*')) {
				let regexp = Utils.wildcardToRegExp(args.name);
				Chronograph.all().forEach(chronograph => {
					if (
						chronograph.getData('type') == ChronographType.STOPWATCH
						&& regexp.test(chronograph.getName())
					) {
						chronograph.adjust(time, args.unit);
					}
				});

				return Promise.resolve(true);
			} else {
				let id = Utils.generateId(ChronographType.STOPWATCH, args.name);
				let stopwatch = Chronograph.get(id);
				if (!!stopwatch) {
					stopwatch.adjust(time, args.unit);
					return Promise.resolve(true);
				}

				return Promise.reject(new Error(this.homey.__("stopwatch_not_running", { "name": args.name })));
			}
		});
	}
}

module.exports = StopwatchAdjust;
