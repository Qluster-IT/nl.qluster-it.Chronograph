const Homey = require('homey');
const Chronograph = require('../../chronograph.js');
const { Utils, ChronographType } = require('../../utils.js');

class TimerResume { 
	constructor(actionId, homey) {
		//super(actionId);

		
this.homey=homey;
this.card = homey.flow.getActionCard(actionId);
		this.card.registerRunListener((args) => {
			if (!Utils.validateName(args.name)) {
				return Promise.reject(new Error(this.homey.__("invalid_name")));
			}

			let time = Utils.evalTime(args.time);
			if (
				isNaN(time) ||
				time <= 0
			) {
				return Promise.reject(new Error(this.homey.__('invalid_duration')));
			}

			let id = Utils.generateId(ChronographType.TIMER, args.name);
			let timer = Chronograph.get(id);
			if (!timer) {
				timer = new Chronograph(id, args.name, time, args.unit);
				timer.setData('type', ChronographType.TIMER);

				let splits = this.homey.settings.get('timer_splits') || [];
				splits
					.filter(split => {
						if (split.name.includes('*')) {
							let regexp = Utils.wildcardToRegExp(split.name);
							return regexp.test(timer.getName());
						} else {
							split.name == timer.getName();
						}
					})
					.forEach(split => {
						let reversedSplit = timer.getTargetDuration() - Utils.calculateDuration(split.time, split.unit);
						timer.addSplit(reversedSplit, 'milliseconds', split);
					});
	
				timer.start();
			} else {
				if (!timer.isRunning()) {
					timer.resume();
				}
			}

			return Promise.resolve(true);
		});

		this.card.on('update', this._storeCards.bind(this));

		this._storeCards();
	}

	_storeCards() {
		this.card.getArgumentValues().then(args => {
			this.homey.settings.set('timer_resume_cards', args);
			Chronograph.events.emit('resume_cards_updated', args);
		});
	}
}

module.exports = TimerResume;
