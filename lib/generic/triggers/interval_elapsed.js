'use strict';

const SETTINGS_KEY = 'interval_elapsed_schedules';
const MAX_TIMEOUT = 2147483647;
const RETRY_DELAY = 5000;
const units = new Map([
	['seconds', 1000],
	['minutes', 60 * 1000],
	['hours', 60 * 60 * 1000],
	['days', 24 * 60 * 60 * 1000]
]);

function intervalMilliseconds(args) {
	const unit = args.unit && (args.unit.id || args.unit);
	if (!Number.isSafeInteger(args.amount) || args.amount < 1 || !units.has(unit)) {
		throw new Error('Interval must be a whole number of seconds, minutes, hours or days');
	}
	const interval = args.amount * units.get(unit);
	if (!Number.isSafeInteger(interval) || !Number.isSafeInteger(Date.now() + interval)) {
		throw new Error('Interval is too large');
	}
	return interval;
}

class IntervalElapsed {
	constructor(triggerId, homey) {
		this.homey = homey;
		this.card = homey.flow.getTriggerCard(triggerId);
		this.schedules = new Map();
		const saved = homey.settings.get(SETTINGS_KEY);
		if (saved != null && (typeof saved !== 'object' || Array.isArray(saved))) {
			homey.error('Invalid saved interval schedules', saved);
		}
		this.saved = saved && typeof saved === 'object' && !Array.isArray(saved) ? saved : {};
		this.initialized = false;
		this.stopped = false;
		this.revision = 0;
		this.timer = null;
		this.retryTimer = null;

		this.card.registerRunListener((args, state) => {
			try {
				return intervalMilliseconds(args) === state.interval;
			} catch (error) {
				this.homey.error('Invalid interval Flow card', error);
				return false;
			}
		});
		this.card.on('update', () => this.refresh());
		this.homey.once('unload', () => this.stop());
		this.refresh();
	}

	async refresh() {
		if (this.stopped) return;
		const revision = ++this.revision;
		let args;
		try {
			args = await this.card.getArgumentValues();
			if (!Array.isArray(args)) throw new Error('Invalid interval Flow arguments');
		} catch (error) {
			if (this.stopped || revision !== this.revision) return;
			this.homey.error('Unable to load interval Flow cards', error);
			this.retryRefresh();
			return;
		}
		if (this.stopped || revision !== this.revision) return;
		if (this.retryTimer) this.homey.clearTimeout(this.retryTimer);
		this.retryTimer = null;

		const now = Date.now();
		const schedules = new Map();
		for (const values of args) {
			let interval;
			try {
				interval = intervalMilliseconds(values);
			} catch (error) {
				this.homey.error('Invalid interval Flow card', error);
				continue;
			}
			if (schedules.has(interval)) continue;
			const current = this.schedules.get(interval);
			const savedDue = this.saved[interval];
			if (current) {
				schedules.set(interval, current);
			} else if (!this.initialized && savedDue !== undefined) {
				if (Number.isSafeInteger(savedDue) && savedDue > 0) {
					schedules.set(interval, { nextDue: savedDue });
				} else {
					this.homey.error('Invalid saved interval deadline', interval, savedDue);
					schedules.set(interval, { nextDue: now + interval });
				}
			} else {
				schedules.set(interval, { nextDue: now + interval });
			}
		}
		this.schedules = schedules;
		this.initialized = true;
		try {
			this.persist();
		} catch (error) {
			this.homey.error('Unable to save interval schedules', error);
			this.retryRefresh();
			return;
		}
		this.processDue();
	}

	retryRefresh() {
		if (this.stopped || this.retryTimer) return;
		this.retryTimer = this.homey.setTimeout(() => {
			this.retryTimer = null;
			this.refresh();
		}, RETRY_DELAY);
	}

	persist() {
		const saved = {};
		for (const [interval, schedule] of this.schedules) saved[interval] = schedule.nextDue;
		this.homey.settings.set(SETTINGS_KEY, saved);
		this.saved = saved;
	}

	processDue() {
		if (this.stopped) return;
		const now = Date.now();
		for (const [interval, schedule] of this.schedules) {
			if (!schedule.inFlight && (schedule.retryAt || schedule.nextDue) <= now) {
				this.trigger(interval, schedule, now);
			}
		}
		this.scheduleNext();
	}

	async trigger(interval, schedule, startedAt) {
		schedule.inFlight = true;
		try {
			await this.card.trigger({}, { interval });
		} catch (error) {
			if (this.stopped || this.schedules.get(interval) !== schedule) return;
			this.homey.error('Unable to trigger interval Flow cards', interval, error);
			schedule.inFlight = false;
			schedule.retryAt = Date.now() + RETRY_DELAY;
			this.scheduleNext();
			return;
		}
		if (this.stopped || this.schedules.get(interval) !== schedule) return;
		const now = Date.now();
		schedule.nextDue = startedAt + interval;
		if (schedule.nextDue <= now) schedule.nextDue = now + interval;
		schedule.inFlight = false;
		delete schedule.retryAt;
		try {
			this.persist();
		} catch (error) {
			this.homey.error('Unable to save interval schedules', error);
			this.retryRefresh();
		}
		this.scheduleNext();
	}

	scheduleNext() {
		if (this.timer) this.homey.clearTimeout(this.timer);
		this.timer = null;
		if (this.stopped) return;
		let next = Infinity;
		for (const schedule of this.schedules.values()) {
			if (!schedule.inFlight) next = Math.min(next, schedule.retryAt || schedule.nextDue);
		}
		if (next !== Infinity) {
			this.timer = this.homey.setTimeout(() => {
				this.timer = null;
				this.processDue();
			}, Math.min(MAX_TIMEOUT, Math.max(0, next - Date.now())));
		}
	}

	stop() {
		this.stopped = true;
		this.revision++;
		if (this.timer) this.homey.clearTimeout(this.timer);
		if (this.retryTimer) this.homey.clearTimeout(this.retryTimer);
		this.timer = null;
		this.retryTimer = null;
	}
}

module.exports = IntervalElapsed;
