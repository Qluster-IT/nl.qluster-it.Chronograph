const Data = require('./data.js');
const { Utils, ExtendedEventEmitter, LogLevel, ChronographType } = require('./utils.js');
const { resolveSplitNames } = require('./flow-arguments.js');

// Periodic rechecks keep wall-clock changes from delaying long deadlines indefinitely.
const MAX_DEADLINE_WAIT = 30000;

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
		this._deadlineTimeout = null;
		this._orderedSplits = [];
		this._nextSplitIndex = 0;
		this._transitionSplits = null;

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

	}

	_setTransitionSplits(steps) {
		this._transitionSplits = steps >= 3
			? { count: steps - 2, interval: this.getTargetDuration() / (steps - 1), nextIndex: 1 }
			: null;
	}

	_resetTransitionSplits() {
		const splits = this._transitionSplits;
		if (!splits) return;
		let index = Math.min(splits.count + 1, Math.max(1, Math.floor(this._duration / splits.interval)));
		while (index <= splits.count && this._duration > index * splits.interval) index++;
		while (index > 1 && this._duration <= (index - 1) * splits.interval) index--;
		splits.nextIndex = index;
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

	getRealtimeData() {
		const data = { ...this.getAllData() };
		delete data.flowValues;
		return data;
	}

	static _saveFlowValues(homey, type, name, flowValues) {
		const chronographs = homey.app.chronographs || (homey.app.chronographs = {});
		const configured = chronographs[type.toLowerCase()] || (chronographs[type.toLowerCase()] = []);
		const index = configured.findIndex(chronograph => (typeof chronograph === 'string' ? chronograph : chronograph.name) === name);
		const previous = index !== -1 && typeof configured[index] !== 'string' ? configured[index].flowValues : undefined;
		const keys = Object.keys(flowValues);
		const changed = !previous || keys.length !== Object.keys(previous).length
			|| keys.some(key => !Object.prototype.hasOwnProperty.call(previous, key) || !Object.is(previous[key], flowValues[key]));
		if (index === -1) {
			configured.push({ name, flowValues });
		} else if (typeof configured[index] === 'string') {
			configured[index] = { name, flowValues };
		} else {
			configured[index].flowValues = flowValues;
		}
		if (changed) homey.settings.set('chronographs', chronographs);
		return changed;
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

		this._scheduleNext(true);
		if (Chronograph._chronographs[this._id] === this && this.isRunning()) Chronograph._ensureUpdateTimeout();
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

		let adjust = Utils.calculateDuration(time, unit, true);
		this._duration = Math.max(0.0, this._duration + adjust);

		this._splits.forEach(split => split.passed = this._duration > Utils.calculateDuration(split.time, split.unit, true));
		this._resetTransitionSplits();

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
		if (!silent) Chronograph.events.emit('log', this, "Chronograph paused at duration " + this.getDuration() + " ms.", LogLevel.INFO);

		this._scheduleNext();
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
		if (!silent) Chronograph.events.emit('log', this, "Chronograph resumed.", LogLevel.INFO);

		this._scheduleNext(true);
		if (Chronograph._chronographs[this._id] === this && this.isRunning()) Chronograph._ensureUpdateTimeout();
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

		this._scheduleNext();
	}

	_onTimeout(delay) {
		switch (delay.type) {
			case 'split':
				delay.split.passed = true;
				Chronograph.events.emit('split', this, delay.split);
				break;
			case 'transitionSplit':
				this._transitionSplits.nextIndex++;
				Chronograph.events.emit('split', this, {
					time: delay.duration, unit: 'milliseconds', data: undefined, passed: true
				});
				break;
			case 'main':
				this._paused = (new Date()).getTime();
				this._duration = Utils.calculateDuration(this._time, this._unit, true);
				delete (this._started);

				delete (Chronograph._chronographs[this._id]);

				Chronograph.events.emit('finished', this);
				Chronograph.events.emit('removed', this);
				Chronograph.events.emit('log', this, "Chronograph finished.", LogLevel.INFO);
				break;
		}

		this._scheduleNext();
	}

	_scheduleNext(rebuildSplits = false) {
		if (this._deadlineTimeout !== null) {
			Chronograph.homey.clearTimeout(this._deadlineTimeout);
			this._deadlineTimeout = null;
		}
		if (Chronograph._chronographs[this._id] !== this || !this.isRunning()) return;

		if (rebuildSplits) {
			this._orderedSplits = this._splits
				.map((split, index) => ({
					split,
					index,
					duration: Utils.calculateDuration(split.time, split.unit, true)
				}))
				.filter(item => !item.split.passed)
				.sort((a, b) => a.duration - b.duration || b.index - a.index);
			this._nextSplitIndex = 0;
		}
		while (this._nextSplitIndex < this._orderedSplits.length
			&& this._orderedSplits[this._nextSplitIndex].split.passed) this._nextSplitIndex++;

		const split = this._orderedSplits[this._nextSplitIndex];
		const target = isNaN(this._time) ? Infinity : Utils.calculateDuration(this._time, this._unit, true);
		let next;
		if (split && split.duration <= target) {
			next = { type: 'split', split: split.split, duration: split.duration };
		} else if (target !== Infinity) {
			next = { type: 'main', duration: target };
		}
		const transition = this._transitionSplits;
		if (transition && transition.nextIndex <= transition.count) {
			const duration = transition.nextIndex * transition.interval;
			if (duration <= target && (!next || duration < next.duration
				|| (duration === next.duration && next.type === 'main'))) {
				next = { type: 'transitionSplit', duration };
			}
		}
		if (!next) return;

		const wait = Math.min(MAX_DEADLINE_WAIT, Math.max(0, Math.ceil(next.duration - this.getDuration())));
		const timeout = Chronograph.homey.setTimeout(() => {
			if (this._deadlineTimeout !== timeout) return;
			this._deadlineTimeout = null;
			if (Chronograph._chronographs[this._id] !== this || !this.isRunning()) return;
			if (next.duration > this.getDuration()) {
				this._scheduleNext();
			} else {
				this._onTimeout(next);
			}
		}, wait);
		this._deadlineTimeout = timeout;
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

	static _ensureUpdateTimeout() {
		if (Chronograph._updatesEnabled && Chronograph._updateTimeout === null) {
			Chronograph._updateTimeout = Chronograph.homey.setTimeout(Chronograph._resetUpdateTimeout, 1_000);
		}
	}

	static _resetUpdateTimeout() {
		Chronograph._updatesEnabled = true;
		if (Chronograph._updateTimeout !== null) {
			Chronograph.homey.clearTimeout(Chronograph._updateTimeout);
			Chronograph._updateTimeout = null;
		}
		const results = [];
		let running = false;
		Chronograph.all().forEach(chronograph => {
			if (!chronograph.isRunning()) return;
			running = true;
			try {
				const target = chronograph.getTargetDuration();
				const elapsed = chronograph.getDuration();
				results.push({
					id: chronograph.getId(),
					name: chronograph.getName(),
					duration: elapsed,
					targetDuration: target,
					data: chronograph.getRealtimeData(),
					running: true,
					removed: false,
					now: (new Date()).getTime(),
					remaining: target - elapsed,
					elapsed
				});
			} catch (error) {
				Chronograph.homey.error('Unable to build chronograph realtime update', error);
			}
		});
		if (results.length) {
			try {
				Chronograph.homey.api.realtime('chronograph_event_multi', results).catch(error => {
					Chronograph.homey.error('Unable to send chronograph realtime update', error);
				});
			} catch (error) {
				Chronograph.homey.error('Unable to send chronograph realtime update', error);
			}
		}
		if (running) Chronograph._ensureUpdateTimeout();
	}

	static transition_startRunListener(homey, args, options = {}) {
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

		if (steps >= 3) {
			let stepDuration = transition.getTargetDuration() / (steps - 1);
			if (stepDuration < 250) {
				return Promise.reject(new Error(homey.__('invalid_transition')));
			}
			transition._setTransitionSplits(steps);
		}

		const flowValues = {
			time,
			unit: args.unit && (args.unit.id || args.unit),
			from,
			to,
			steps: parseInt(args.steps)
		};
		let flowValuesChanged = false;
		if (options.persistFlowValues !== false) {
			transition.setData('flowValues', flowValues);
			flowValuesChanged = Chronograph._saveFlowValues(homey, ChronographType.TRANSITION, name, flowValues);
		}
		transition.start();
		if (flowValuesChanged) Chronograph.events.emit('flow_values_changed', { type: ChronographType.TRANSITION, name, flowValues });

		return Promise.resolve(true);
	}

	static async resolveTimerSplits(homey) {
		const [remaining, elapsed] = await Promise.all([
			resolveSplitNames(homey, 'timer_splits'),
			resolveSplitNames(homey, 'timer_elapsed_splits')
		]);
		return { remaining, elapsed };
	}

	static addTimerSplits(timer, homey, splits) {
		const matchesTimer = split => {
			if (split.name && split.name.includes('*')) {
				return Utils.wildcardToRegExp(split.name).test(timer.getName());
			}
			return split.name == timer.getName();
		};

		(splits ? splits.remaining : homey.settings.get('timer_splits') || [])
			.filter(matchesTimer)
			.forEach(split => {
				const elapsedTime = timer.getTargetDuration() - Utils.calculateDuration(split.time, split.unit);
				timer.addSplit(elapsedTime, 'milliseconds', { ...split, timerSplitType: 'remaining' });
			});

		(splits ? splits.elapsed : homey.settings.get('timer_elapsed_splits') || [])
			.filter(matchesTimer)
			.forEach(split => {
				timer.addSplit(split.time, split.unit, { ...split, timerSplitType: 'elapsed' });
			});
	}

	static addStopwatchSplits(stopwatch, splits) {
		splits.filter(split => {
			if (split.name && split.name.includes('*')) {
				return Utils.wildcardToRegExp(split.name).test(stopwatch.getName());
			}
			return split.name == stopwatch.getName();
		}).forEach(split => stopwatch.addSplit(split.time, split.unit, split));
	}

	static async timer_startRunListener(homey, args, options = {}) {
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

		const splits = await Chronograph.resolveTimerSplits(homey);
		let id = Utils.generateId(ChronographType.TIMER, name);
		if (options.beforeCreate && options.beforeCreate() === false) return true;
		let timer = new Chronograph(id, name, time, args.unit);
		timer._args = args;
		timer.setData('type', ChronographType.TIMER);
		const flowValues = {
			time,
			unit: args.unit && (args.unit.id || args.unit)
		};
		let flowValuesChanged = false;
		if (options.persistFlowValues !== false) {
			timer.setData('flowValues', flowValues);
			flowValuesChanged = Chronograph._saveFlowValues(homey, ChronographType.TIMER, name, flowValues);
		}

		Chronograph.addTimerSplits(timer, homey, splits);

		timer.start();
		if (flowValuesChanged) Chronograph.events.emit('flow_values_changed', { type: ChronographType.TIMER, name, flowValues });

		return Promise.resolve(true);
	}

	static async stopwatch_startRunListener(homey, args, options = {}) {
		let name = args.namedd ? args.namedd.name : args.name;
		if (!name) return Promise.reject(new Error(homey.__("name_required")));
		if (!Utils.validateName(name)) {
			return Promise.reject(new Error(homey.__("invalid_name")));
		}
		const splits = await resolveSplitNames(homey, 'stopwatch_splits');
		let id = Utils.generateId(ChronographType.STOPWATCH, name);
		if (options.beforeCreate && options.beforeCreate() === false) return true;
		let stopwatch = new Chronograph(id, name);
		stopwatch._args = args;
		stopwatch.setData('type', ChronographType.STOPWATCH);
		const flowValues = {};
		let flowValuesChanged = false;
		if (options.persistFlowValues !== false) {
			stopwatch.setData('flowValues', flowValues);
			flowValuesChanged = Chronograph._saveFlowValues(homey, ChronographType.STOPWATCH, name, flowValues);
		}

		Chronograph.addStopwatchSplits(stopwatch, splits);

		stopwatch.start();
		if (flowValuesChanged) Chronograph.events.emit('flow_values_changed', { type: ChronographType.STOPWATCH, name, flowValues });

		return Promise.resolve(true);
	}
}

Chronograph.events = new ExtendedEventEmitter();
Chronograph.events.setMaxListeners(0);
Chronograph._chronographs = {};
Chronograph._updateTimeout = null;
Chronograph._updatesEnabled = false;
module.exports = Chronograph;
