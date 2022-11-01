const Homey = require('homey');
const Chronograph = require('../../chronograph.js');
const { Utils, ChronographType } = require('../../utils.js');

class TransitionRunning { 
	constructor(conditionId, homey) {
		//super(conditionId);

		
this.homey=homey;
this.card = homey.flow.getConditionCard(conditionId);
		this.card.registerRunListener(args => {
			if (args.name.includes('*')) {
				let regexp = Utils.wildcardToRegExp(args.name);
				let anyRunning = false;
				Chronograph.all().forEach(chronograph => {
					if (
						chronograph.getData('type') == ChronographType.TRANSITION && regexp.test(chronograph.getName())
					) {
						if(chronograph.isRunning()) anyRunning=true;
					}
				});

				return Promise.resolve(anyRunning);
			} else {
				let id = Utils.generateId(ChronographType.TRANSITION, args.name);
				let transition = Chronograph.get(id, args.name);
				return Promise.resolve(!!transition && transition.isRunning());
			}
		});
	}
}

module.exports = TransitionRunning;
