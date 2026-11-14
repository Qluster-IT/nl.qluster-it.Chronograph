const { registerFlowRunListener } = require('../../flow-arguments.js');
const { storeCardArguments } = require('../../flow-cards.js');
const Chronograph = require('../../chronograph.js');
const { Utils, ChronographType } = require('../../utils.js');

class TransitionResume { 
	constructor(actionId, homey) {
		//super(actionId);

		
this.homey=homey;
this.card = homey.flow.getActionCard(actionId);
		registerFlowRunListener(this.card, actionId, (args) => {
			let name = args.namedd ? args.namedd.name : args.name;
		if(!name) return Promise.reject(new Error(homey.__("name_required")));	if (!Utils.validateName(name)) {
				return Promise.reject(new Error(this.homey.__("invalid_name")));
			}

		let id = Utils.generateId(ChronographType.TRANSITION, name);
		let transition = Chronograph.get(id);
		if (!transition) {
			return Chronograph.transition_startRunListener(this.homey, args);
		}

		let time = Utils.evalTime(args.time);
			if (
				isNaN(time) ||
				time < 0
			) {
				return Promise.reject(new Error(this.homey.__('invalid_duration')));
			}

			let from = parseFloat(args.from);
			let to = parseFloat(args.to);
			let steps = parseInt(args.steps);
			if (
				isNaN(from)
				|| isNaN(to)
				|| isNaN(steps)
				|| steps < 2
			) {
				return Promise.reject(new Error(this.homey.__('invalid_transition')));
			}

			if (!transition.isRunning()) {
				transition.resume();
			}

			return Promise.resolve(true);
		});

		this._storeCards = storeCardArguments(this.card, homey, 'transition_resume_cards', 'resume_cards_updated');
		this._storeCards();
	}
}

module.exports = TransitionResume;
