const { registerFlowRunListener } = require('../../flow-arguments.js');
const { storeCardArguments } = require('../../flow-cards.js');
const Homey = require('homey');
const Chronograph = require('../../chronograph.js');
const { Utils, ChronographType } = require('../../utils.js');

class StopwatchResume {
	constructor(actionId, homey) {
		//super(actionId);


		this.homey = homey;
		this.card = homey.flow.getActionCard(actionId);
		registerFlowRunListener(this.card, actionId, (args) => {
			let name = args.namedd ? args.namedd.name : args.name;
			if (!name) return Promise.reject(new Error(homey.__("name_required"))); if (!Utils.validateName(name)) {
				return Promise.reject(new Error(this.homey.__("invalid_name")));
			}

			let id = Utils.generateId(ChronographType.STOPWATCH, name);
			let stopwatch = Chronograph.get(id);
			if (!stopwatch) {
				return Chronograph.stopwatch_startRunListener(this.homey, args, {
					beforeCreate: () => {
						const current = Chronograph.get(id);
						if (!current) return true;
						if (!current.isRunning()) current.resume();
						return false;
					}
				});
			}
			if (!stopwatch.isRunning()) stopwatch.resume();

			return Promise.resolve(true);
		});

		this._storeCards = storeCardArguments(this.card, homey, 'stopwatch_resume_cards', 'resume_cards_updated');
		this._storeCards();
	}
}

module.exports = StopwatchResume;
