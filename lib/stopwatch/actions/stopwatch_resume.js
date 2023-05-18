const Homey = require('homey');
const Chronograph = require('../../chronograph.js');
const { Utils, ChronographType } = require('../../utils.js');

class StopwatchResume { 
	constructor(actionId, homey) {
		//super(actionId);

		
this.homey=homey;
this.card = homey.flow.getActionCard(actionId);
		this.card.registerRunListener((args) => {
			let name = args.namedd ? args.namedd.name : args.name;
			if (!Utils.validateName(name)) {
				return Promise.reject(new Error(this.homey.__("invalid_name")));
			}

			let id = Utils.generateId(ChronographType.STOPWATCH, name);
			let stopwatch = Chronograph.get(id);
			if (!stopwatch) {
				stopwatch = new Chronograph(id, name);
				stopwatch.setData('type', ChronographType.STOPWATCH);

				let splits = this.homey.settings.get('stopwatch_splits') || [];
				splits
					.filter(split => {
						if (split.name.includes('*')) {
							let regexp = Utils.wildcardToRegExp(split.name);
							return regexp.test(stopwatch.getName());
						} else {
							split.name == stopwatch.getName();
						}
					})
					.forEach(split => stopwatch.addSplit(split.time, split.unit, split));

				stopwatch.start();
			} else {
				if (!stopwatch.isRunning()) {
					stopwatch.resume();
				}
			}

			return Promise.resolve(true);
		});

		this.card.on('update', this._storeCards.bind(this));

		this._storeCards();
	}

	_storeCards() {
		this.card.getArgumentValues().then(args => {
			this.homey.settings.set('stopwatch_resume_cards', args);
			Chronograph.events.emit('resume_cards_updated', args);
		});
	}
}

module.exports = StopwatchResume;
