const Homey = require('homey');
const Chronograph = require('../../chronograph.js');
const { Utils, ChronographType } = require('../../utils.js');

class TimerStop { 
	constructor(actionId, homey) {
		//super(actionId);

		
this.homey=homey;
this.card = homey.flow.getActionCard(actionId);
		this.card.registerRunListener((args) => {
			let name = args.namedd ? args.namedd.name : args.name;
		if(!name) return Promise.reject(new Error(homey.__("name_required")));	if (name.includes('*')) {
				let regexp = Utils.wildcardToRegExp(name);
				Chronograph.all().forEach(chronograph => {
					if (
						chronograph.getData('type') == ChronographType.TIMER
						&& regexp.test(chronograph.getName())
					) {
						chronograph.stop();
					}
				});

				return Promise.resolve(true);
			} else {
				let id = Utils.generateId(ChronographType.TIMER, name);
				let timer = Chronograph.get(id);
				if (!!timer) {
					timer.stop();
					return Promise.resolve(true);
				}

				return Promise.reject(new Error(this.homey.__("timer_not_running", { "name": name })));
			}
		});
	}
}

module.exports = TimerStop;
