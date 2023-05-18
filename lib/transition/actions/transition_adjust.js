const Homey = require('homey');
const Chronograph = require('../../chronograph.js');
const { Utils, ChronographType } = require('../../utils.js');

class TransitionAdjust { 
	constructor(actionId, homey) {
		//super(actionId);

		
this.homey=homey;
this.card = homey.flow.getActionCard(actionId);
		this.card.registerRunListener((args) => {
			let time = Utils.evalTime(args.time);
			if (isNaN(time)) {
				return Promise.reject(new Error(this.homey.__("invalid_duration")));
			}
			let name = args.namedd ? args.namedd.name : args.name;

			if (name.includes('*')) {
				let regexp = Utils.wildcardToRegExp(name);
				Chronograph.all().forEach(chronograph => {
					if (
						chronograph.getData('type') == ChronographType.TRANSITION && regexp.test(chronograph.getName())
					) {
						chronograph.adjust(time, args.unit);
					}
				});

				return Promise.resolve(true);
			} else {
				let id = Utils.generateId(ChronographType.TRANSITION, name);
				let transition = Chronograph.get(id);
				if (!!transition) {
					transition.adjust(time, args.unit);
					return Promise.resolve(true);
				}

				return Promise.reject(new Error(this.homey.__("transition_not_running", { "name": name })));
			}
		});
	}
}

module.exports = TransitionAdjust;
