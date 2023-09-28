const Data = require('./data.js');
const { Utils, ExtendedEventEmitter, LogLevel, ChronographType } = require('./utils.js');

class Chronograph extends Data {
	constructor(id, name, time = NaN, unit = 'seconds') {
		super();

		this._id = id;
		this._name = name;
		this._time = time;
		this._unit = unit;
		this._splits = [];
		this._paused = (new Date()).getTime();
		this._duration = 0;

		let existingChronograph = Chronograph._chronographs[this._id];
		if (!!existingChronograph) {
			if (existingChronograph.isRunning()) {
				existingChronograph.stop(true);
			}
			Chronograph._chronographs[this._id] = this;
			Chronograph.events.emit('updated', this);
		} else {
			Chronograph._chronographs[this._id] = this;
			Chronograph.events.emit('created', this);
		}
	}

	getId() {
		return this._id;
	}

	getName() {
		return this._name;
	}

	addSplit(time, unit, data) {
		if (!Chronograph._chronographs[this._id]) {
			Chronograph.events.emit('log', this, "Chronograph not found.", LogLevel.ERROR);
			return;
		}

		let wasRunning = this.isRunning();
		if (wasRunning) {
			this.pause(true);
		}

		let split = { time: time, unit: unit, data: data, passed: false };
		this._splits.push(split);

		if (wasRunning) {
			this.resume(true);
		}

		Chronograph.events.emit('log', this, "Chronograph split added at " + Utils.calculateDuration(time, unit) + " ms.", LogLevel.INFO);
	}

	isRunning() {
		return !this._paused && !!this._started;
	}

	getDuration() {
		if (this.isRunning()) {
			return Math.max(0.0, this._duration + ((new Date()).getTime() - this._started));
		} else {
			return this._duration;
		}
	}

	getTargetDuration() {
		if (!isNaN(this._time)) {
			return Utils.calculateDuration(this._time, this._unit);
		} else {
			return NaN;
		}
	}

	start(silent) {
		if (!Chronograph._chronographs[this._id]) {
			Chronograph.events.emit('log', this, "Chronograph not found.", LogLevel.ERROR);
			return;
		}
		if (this.isRunning()) {
			Chronograph.events.emit('log', this, "Chronograph already running.", LogLevel.WARNING);
			return;
		}

		this._started = (new Date()).getTime();
		delete (this._paused);

		if (!silent) {
			Chronograph.events.emit('started', this);
		}
		if (isNaN(this._time)) {
			Chronograph.events.emit('log', this, "Chronograph started.", LogLevel.INFO);
		} else {
			Chronograph.events.emit('log', this, "Chronograph started with duration " + this.getTargetDuration() + " ms.", LogLevel.INFO);
		}

		Chronograph._resetNextTimeout();
	}

	adjust(time, unit, silent) {
		if (!Chronograph._chronographs[this._id]) {
			Chronograph.events.emit('log', this, "Chronograph not found.", LogLevel.ERROR);
			return;
		}

		let wasRunning = this.isRunning();
		if (wasRunning) {
			this.pause(true);
		}

		let adjust = Utils.calculateDuration(time, unit);
		this._duration = Math.max(0.0, this._duration + adjust);

		this._splits.forEach(split => split.passed = this._duration > Utils.calculateDuration(split.time, split.unit));

		if (wasRunning) {
			this.resume(true);
		}
		if (!silent) {
			Chronograph.events.emit('updated', this);
		}
		Chronograph.events.emit('log', this, "Chronograph adjusted to duration of " + this.getDuration() + " ms.", LogLevel.INFO);
	}

	pause(silent) {
		if (!Chronograph._chronographs[this._id]) {
			Chronograph.events.emit('log', this, "Chronograph not found.", LogLevel.ERROR);
			return;
		}
		if (!this.isRunning()) {
			Chronograph.events.emit('log', this, "Chronograph not running.", LogLevel.WARNING);
			return;
		}

		this._paused = (new Date()).getTime();
		this._duration += (this._paused - this._started);
		delete (this._started);

		if (!silent) {
			Chronograph.events.emit('paused', this);
		}
		Chronograph.events.emit('log', this, "Chronograph paused at duration " + this.getDuration() + " ms.", LogLevel.INFO);

		Chronograph._resetNextTimeout();
	}

	resume(silent) {
		if (!Chronograph._chronographs[this._id]) {
			Chronograph.events.emit('log', this, "Chronograph not found.", LogLevel.ERROR);
			return;
		}
		if (this.isRunning()) {
			Chronograph.events.emit('log', this, "Chronograph already running.", LogLevel.WARNING);
			return;
		}

		this._started = (new Date()).getTime();
		delete (this._paused);

		if (!silent) {
			Chronograph.events.emit('resumed', this);
		}
		Chronograph.events.emit('log', this, "Chronograph resumed.", LogLevel.INFO);

		Chronograph._resetNextTimeout();
	}

	stop(silent) {
		if (!Chronograph._chronographs[this._id]) {
			Chronograph.events.emit('log', this, "Chronograph not found.", LogLevel.ERROR);
			return;
		}

		this._paused = (new Date()).getTime();
		if (!!this._started) {
			this._duration += (this._paused - this._started);
		}
		delete (this._started);

		delete (Chronograph._chronographs[this._id]);

		if (!silent) {
			Chronograph.events.emit('stopped', this);
			Chronograph.events.emit('removed', this);
		}
		Chronograph.events.emit('log', this, "Chronograph stopped.", LogLevel.INFO);

		Chronograph._resetNextTimeout();
	}

	_onTimeout(delay) {
		switch (delay.type) {
			case 'split':
				delay.split.passed = true;
				Chronograph.events.emit('split', this, delay.split);
				Chronograph.events.emit('log', this, "Chronograph split on " + this.getDuration() + " ms.", LogLevel.INFO);
				break;
			case 'main':
				this._paused = (new Date()).getTime();
				this._duration = Utils.calculateDuration(this._time, this._unit);
				delete (this._started);

				delete (Chronograph._chronographs[this._id]);

				Chronograph.events.emit('finished', this);
				Chronograph.events.emit('removed', this);
				Chronograph.events.emit('log', this, "Chronograph finished.", LogLevel.INFO);
				break;
		}

		Chronograph._resetNextTimeout();
	}

	static get(id) {
		let chronograph = Chronograph._chronographs[id];
		if (!!chronograph) {
			return chronograph;
		} else {
			return false;
		}
	}

	static all() {
		let result = [];
		for (const id in Chronograph._chronographs) {
			result.push(Chronograph._chronographs[id]);
		}
		return result;
	}

	static _resetUpdateTimeout() {
		try {

			if (Chronograph._updateTimeout) {
				Chronograph.homey.clearTimeout(Chronograph._updateTimeout);
				Chronograph._updateTimeout = null;
			}

			const results = [];
			const chronographs = Chronograph.all().filter(chronograph => chronograph.isRunning());

			chronographs.forEach(chronograph => {
				try {

					//Chronograph.events.emit('realtime_update', x);

					let target = chronograph.getTargetDuration();
					let elapsed = chronograph.getDuration();
					let remaining = target - elapsed;
					let name = chronograph.getName();
					let raw = {
						id: chronograph.getId(),
						name,
						duration: elapsed,//chronograph.getDuration(),
						targetDuration: target,//chronograph.getTargetDuration(),
						data: chronograph.getAllData(),
						running: chronograph.isRunning(),
						removed: false,
						now: (new Date()).getTime(),
						remaining,
						elapsed
					};
					results.push(raw);
					try {

						let type = chronograph.getData('type').toLowerCase();
						let chrono = Chronograph.homey.app.chronographs[type].find(x=>x.name==name);
						chrono.action = raw.now;
					} catch (error) {

					}


				} catch (error) {
					let err = error;
				}
			});
			if (results && results.length) {
				Chronograph.homey.api.realtime('chronograph_event_multi', results).catch(() => { }).then(() => { });
				Chronograph.homey.app.saveChronographs();
			}
			//const time = Chronograph._updateTime ? 1_000 - ;

		} catch (error) {

		}
		Chronograph._updateTimeout = Chronograph.homey.setTimeout(Chronograph._resetUpdateTimeout, 1_000);

	}

	static _resetNextTimeout() {
		//Chronograph.events.emit('log', null, "Interval - Update entities.", LogLevel.INFO);
		//Chronograph._resetUpdateTimeout();
		if (Chronograph._timeout) {
			Chronograph.homey.clearTimeout(Chronograph._timeout);
			Chronograph._timeout = null;
		}

		// Only work with running chronographs.
		let chronographs = Chronograph
			.all()
			.filter(chronograph => chronograph.isRunning());

		// First the main delays are added to the delays array.
		let delays = [];
		delays.push.apply(
			delays,
			chronographs
				.filter(chronograph => !isNaN(chronograph._time))
				.map(chronograph => ({
					type: 'main',
					chronograph: chronograph,
					duration: Utils.calculateDuration(chronograph._time, chronograph._unit) - chronograph.getDuration()
				})));

		// Then the splits are added.
		delays.push.apply(
			delays,
			chronographs.reduce((accumulator, chronograph) => {
				accumulator.push.apply(
					accumulator,
					chronograph._splits
						.map(split => {
							let duration = Utils.calculateDuration(split.time, split.unit) - chronograph.getDuration();
							return {
								type: 'split',
								chronograph: chronograph,
								duration: duration,
								split: split
							};
						})
						.filter(delay => !delay.split.passed));
				return accumulator;
			}, []));

		// If there are no delays we're not having to set a timeout.
		if (delays.length == 0) {
			return;
		}

		// Sort the delays starting with the shortest first.
		delays.sort((a, b) => a.duration > b.duration ? 1 : -1);

		// The delays are split into smaller, more accurate delays.
		let intermediateDelay = Math.min(30000, delays[0].duration / 2);
		if (intermediateDelay > 300) {
			Chronograph._timeout = Chronograph.homey.setTimeout(Chronograph._resetNextTimeout, intermediateDelay);
		} else {
			Chronograph._timeout = Chronograph.homey.setTimeout(delays[0].chronograph._onTimeout.bind(delays[0].chronograph, delays[0]), Math.max(0, delays[0].duration));
		}
	}



	static transition_startRunListener(homey, args) {
		let name = args.namedd ? args.namedd.name : args.name;
		if (!name) return Promise.reject(new Error(homey.__("name_required")));
		if (!Utils.validateName(name)) {
			return Promise.reject(new Error(homey.__("invalid_name")));
		}

		let time = Utils.evalTime(args.time);
		if (
			isNaN(time) ||
			time < 0
		) {
			return Promise.reject(new Error(homey.__('invalid_duration')));
		}

		let from = parseFloat(args.from);
		let to = parseFloat(args.to);
		let steps = parseInt(args.steps);
		if (
			isNaN(from) || isNaN(to) || isNaN(steps) || steps < 2
		) {
			return Promise.reject(new Error(homey.__('invalid_transition')));
		}

		let id = Utils.generateId(ChronographType.TRANSITION, name);
		let transition = new Chronograph(id, name, time, args.unit);
		transition._args = args;
		transition.setData('type', ChronographType.TRANSITION);
		transition.setData('from', from);
		transition.setData('to', to);

		steps = Math.min(Math.floor(transition.getTargetDuration() / 250), steps);
		transition.setData('steps', steps);

		steps--;
		if (steps >= 2) {
			let stepDuration = transition.getTargetDuration() / steps;
			if (stepDuration < 250) {
				return Promise.reject(new Error(homey.__('invalid_transition')));
			}
			while (--steps > 0) {
				transition.addSplit(steps * stepDuration, 'milliseconds');
			}
		}

		transition.start();

		return Promise.resolve(true);
	}


	static timer_startRunListener(homey, args) {
		let name = args.namedd ? args.namedd.name : args.name;
		if (!name) return Promise.reject(new Error(homey.__("name_required"))); if (!Utils.validateName(name)) {
			return Promise.reject(new Error(homey.__("invalid_name")));
		}

		let time = Utils.evalTime(args.time);
		if (
			isNaN(time) ||
			time <= 0
		) {
			return Promise.reject(new Error(homey.__('invalid_duration')));
		}

		let id = Utils.generateId(ChronographType.TIMER, name);
		let timer = new Chronograph(id, name, time, args.unit);
		timer._args = args;
		timer.setData('type', ChronographType.TIMER);

		let splits = homey.settings.get('timer_splits') || [];
		splits
			.filter(split => {
				if (split.name.includes('*')) {
					let regexp = Utils.wildcardToRegExp(split.name);
					return regexp.test(timer.getName());
				} else {
					return split.name == timer.getName();
				}
			})
			.forEach(split => {
				let reversedSplit = timer.getTargetDuration() - Utils.calculateDuration(split.time, split.unit);
				timer.addSplit(reversedSplit, 'milliseconds', split);
			});

		timer.start();

		return Promise.resolve(true);
	}

	static stopwatch_startRunListener(homey, args) {
		let name = args.namedd ? args.namedd.name : args.name;

		if (!Utils.validateName(name)) {
			return Promise.reject(new Error(homey.__("invalid_name")));
		}
		let id = Utils.generateId(ChronographType.STOPWATCH, name);
		let stopwatch = new Chronograph(id, name);
		stopwatch._args = args;
		stopwatch.setData('type', ChronographType.STOPWATCH);

		let splits = homey.settings.get('stopwatch_splits') || [];
		homey.log('INFO: stopwatch start splits typeof: ', typeof(splits), ", value: \n", splits);
		splits
			.filter(split => {
				if (split.name.includes('*')) {
					let regexp = Utils.wildcardToRegExp(split.name);
					return regexp.test(stopwatch.getName());
				} else {
					return split.name == stopwatch.getName();
				}
			})
			.forEach(split => stopwatch.addSplit(split.time, split.unit, split));

		stopwatch.start();

		return Promise.resolve(true);
	}
}

Chronograph.events = new ExtendedEventEmitter();
Chronograph.events.setMaxListeners(0);
Chronograph._chronographs = {};
Chronograph._timeout = null;

module.exports = Chronograph;
