const assert = require('assert');
const Chronograph = require('../lib/chronograph.js');
const { ChronographType } = require('../lib/utils.js');

const NativeDate = global.Date;
const nativeSetTimeout = global.setTimeout;
const nativeClearTimeout = global.clearTimeout;
let now = 0;
let wallOffset = 0;
let nextTimeoutId = 0;
let timeouts = [];
let originalUpdateTimeout;
let originalUpdatesEnabled;

const clock = {
	reset() {
		now = 1000000;
		wallOffset = 0;
		nextTimeoutId = 0;
		timeouts = [];
	},
	setTimeout(callback, delay) {
		const timeout = { id: ++nextTimeoutId, at: now + Math.max(0, delay), callback };
		timeouts.push(timeout);
		return timeout.id;
	},
	clearTimeout(id) {
		timeouts = timeouts.filter(timeout => timeout.id !== id);
	},
	shiftWall(delay) {
		wallOffset += delay;
	},
	elapseWithoutCallbacks(delay) {
		now += delay;
	},
	tick(delay) {
		const end = now + delay;
		let executions = 0;
		while (true) {
			timeouts.sort((a, b) => a.at - b.at || a.id - b.id);
			const timeout = timeouts[0];
			if (!timeout || timeout.at > end) break;
			timeouts.shift();
			now = Math.max(now, timeout.at);
			timeout.callback();
			if (++executions > 10000) throw new Error('Fake timer loop exceeded its execution limit');
		}
		now = end;
	}
};

class TestDate extends NativeDate {
	constructor(...args) {
		super(...(args.length ? args : [now + wallOffset]));
	}

	static now() {
		return now + wallOffset;
	}
}

function wait(callback, delay) {
	clock.tick(delay);
	callback();
}

Chronograph.events.on('log', (chronograph, text) => {
//	console.log('[' + chronograph.getName() + '] ' + text);
});

let events = {};

Chronograph.events.on('created', chronograph => events.created = chronograph);
Chronograph.events.on('updated', chronograph => events.updated = chronograph);
Chronograph.events.on('started', chronograph => events.started = chronograph);
Chronograph.events.on('paused', chronograph => events.paused = chronograph);
Chronograph.events.on('resumed', chronograph => events.resumed = chronograph);
Chronograph.events.on('finished', chronograph => events.finished = chronograph);
Chronograph.events.on('stopped', chronograph => events.stopped = chronograph);
Chronograph.events.on('removed', chronograph => events.removed = chronograph);
Chronograph.events.on('split', () => events.split = !!events.split ? events.split + 1 : 1);

describe('Chronograph', () => {
	beforeEach(() => {
		originalUpdateTimeout = Chronograph._updateTimeout;
		originalUpdatesEnabled = Chronograph._updatesEnabled;
		Chronograph._updateTimeout = null;
		Chronograph._updatesEnabled = false;
		clock.reset();
		global.Date = TestDate;
		Chronograph.homey = {
			setTimeout: clock.setTimeout.bind(clock),
			clearTimeout: clock.clearTimeout.bind(clock)
		};
		events = {};
	});

	afterEach(() => {
		Chronograph.all().slice().forEach(chronograph => chronograph.stop(true));
		clock.reset();
		global.Date = NativeDate;
		Chronograph.homey = { setTimeout: nativeSetTimeout, clearTimeout: nativeClearTimeout };
		Chronograph._updateTimeout = originalUpdateTimeout;
		Chronograph._updatesEnabled = originalUpdatesEnabled;
	});

	it('should be properly initialized', function() {
		let name = 'test timer 1';
		let timer = new Chronograph(1, name, 1, 'minutes');
		timer.setData('type', ChronographType.TIMER);
		assert.ok(!!Chronograph.get(1), 'timer should be in global timers array');
		assert.equal(60000, timer.getTargetDuration(), 'target duration should be set correctly');
		assert.ok(!timer.isRunning(), 'new timer should not be running');
		assert.ok(!!events.created, 'created event should be emitted');
		assert.equal(timer, events.created, 'created event should emit correct timer');

		timer = new Chronograph(1, name, 1, 'days');
		timer.setData('type', ChronographType.TIMER);
		assert.equal(60000 * 60 * 24, timer.getTargetDuration(), 'duration should be set correctly');
		assert.ok(!timer.isRunning(), 'new timer should not be running');
		assert.ok(!!events.updated, 'updated event should be emitted');
		assert.equal(timer, events.updated, 'updated event should emit correct timer');
		timer.stop();
		timer.stop(); // second stop should do nothing
		assert.ok(!Chronograph.get(1), 'timer should not be in global timers array');

		name = 'test stopwatch 1';
		let stopwatch = new Chronograph(3, name);
		stopwatch.setData('type', ChronographType.STOPWATCH);
		assert.ok(!!Chronograph.get(3), 'stopwatch should be in global stopwatches array');
		assert.ok(!stopwatch.isRunning(), 'new stopwatch should not be running');
		assert.ok(!!events.created, 'created event should be emitted');
		assert.equal(stopwatch, events.created, 'created event should emit correct stopwatch');

		stopwatch = new Chronograph(3, name);
		stopwatch.setData('type', ChronographType.STOPWATCH);
		assert.ok(!stopwatch.isRunning(), 'new stopwatch should not be running');
		assert.ok(!!events.updated, 'updated event should be emitted');
		assert.equal(stopwatch, events.updated, 'updated event should emit correct stopwatch');
		stopwatch.stop();
		stopwatch.stop(); // second stop should do nothing
		assert.ok(!Chronograph.get(3), 'stopwatch should not be in global stopwatches array');

		events = {};
	});

	it('should start and finish a timer with fractional second precision', function(done) {
		this.timeout(250); // the entire test should not exceed this timeout

		let name = 'test timer 2';
		let timer = new Chronograph(5, name, 0.1, 'seconds');
		timer.setData('type', ChronographType.TIMER);
		assert.ok(!!Chronograph.get(5), 'timer should be in global timers array');
		timer.start();
		timer.start(); // second start should do nothing
		assert.ok(!!events.started, 'started event should be emitted');
		assert.equal(timer, events.started, 'started event should emit correct timer');
		assert.ok(timer.isRunning(), 'new timer should be running');
		wait(() => {
			assert.ok(!Chronograph.get(5), 'timer should not be in global timers array after finish');
			assert.equal(timer.getDuration(), timer.getTargetDuration(), 'after finishing the timer should have a the target duration')
			assert.ok(!timer.isRunning(), 'new timer should not be running after finishing');
			assert.ok(!!events.finished, 'finished event should be emitted');
			assert.equal(timer, events.finished, 'finished event should emit correct timer');
			assert.ok(!!events.removed, 'removed event should be emitted');
			assert.equal(timer, events.removed, 'removed event should emit correct timer');

			events = {};
			done();
		}, 200);
	});

	it('should start and stop a timer', function(done) {
		this.timeout(1250); // the entire test should not exceed this timeout

		let name = 'test timer 3';
		let timer = new Chronograph(6, name, 0.3, 'seconds');
		timer.setData('type', ChronographType.TIMER);
		assert.ok(!!Chronograph.get(6), 'timer should be in global timers array');
		timer.start();
		assert.ok(!!events.started, 'started event should be emitted');
		assert.equal(timer, events.started, 'started event should emit correct timer');

		wait(() => {
			timer.stop();
			assert.ok(!Chronograph.get(6), 'timer should not be in global timers array after stopping');
			assert.ok(!timer.isRunning(), 'stopped timer should not be running');
			assert.ok(!!events.stopped, 'stopped event should be emitted');
			assert.equal(timer, events.stopped, 'stopped event should emit correct timer');

			wait(() => {
				assert.ok(!events.finished, 'finished event should not be emitted');
				assert.ok(!events.split, 'split event should not be emitted');
				assert.ok(!events.paused, 'paused event should not be emitted');
				assert.ok(!events.resumed, 'resumed event should not be emitted');

				events = {};
				done();
			}, 1000); // stopped
		}, 200); // running
	});

	it('should start a stopwatch and read duration in ms', function(done) {
		this.timeout(450); // the entire test should not exceed this timeout

		let name = 'test stopwatch 2';
		let stopwatch = new Chronograph(7, name);
		stopwatch.setData('type', ChronographType.STOPWATCH);
		assert.ok(!!Chronograph.get(7), 'stopwatch should be in global stopwatches array');
		stopwatch.start();
		stopwatch.start(); // second start should do nothing
		assert.ok(!!events.started, 'started event should be emitted');
		assert.equal(stopwatch, events.started, 'started event should emit correct stopwatch');
		assert.ok(stopwatch.isRunning(), 'new stopwatch should be running');
		wait(() => {
			assert.ok(stopwatch.getDuration() > 350 && stopwatch.getDuration() < 450, 'stopwatch should running at the correct position');
			stopwatch.stop();

			events = {};
			done();
		}, 400);
	});

	it('should start, pause, resume and finish a timer', function(done) {
		this.timeout(3100); // the entire test should not exceed this timeout

		let name = 'test timer 4';
		let timer = new Chronograph(8, name, 2, 'seconds');
		timer.setData('type', ChronographType.TIMER);
		assert.ok(!!Chronograph.get(8), 'timer should be in global timers array');
		timer.start();
		assert.ok(!!events.started, 'started event should be emitted');
		assert.equal(timer, events.started, 'started event should emit correct timer');

		wait(() => {
			assert.ok(timer.isRunning(), 'timer should be running');
			timer.pause();
			assert.ok(!timer.isRunning(), 'paused timer should not be running');
			assert.ok(!!Chronograph.get(8), 'timer should still be in global timers array after pause');
			assert.ok((timer.getTargetDuration() - timer.getDuration()) > 1450 && (timer.getTargetDuration() - timer.getDuration()) < 1550,	'timer should stopped at the correct position');
			assert.ok(!!events.paused, 'paused event should be emitted');
			assert.equal(timer, events.paused, 'paused event should emit correct timer');

			wait(() => {
				assert.ok((timer.getTargetDuration() - timer.getDuration()) > 1450 && (timer.getTargetDuration() - timer.getDuration()) < 1550, 'timer should not moved when paused');
				timer.resume();
				assert.ok(!!Chronograph.get(8), 'timer should still be in global timers array after resume');
				assert.ok(timer.isRunning(), 'timer should be running');
				assert.ok(!!events.resumed, 'resumed event should be emitted');
				assert.equal(timer, events.resumed, 'resumed event should emit correct timer');

				wait(() => {
					assert.ok(timer.getDuration() > 950 && timer.getDuration() < 1050, 'timer duration should be correct while running');
					timer.pause();
					assert.ok(timer.getDuration() > 950 && timer.getDuration() < 1050, 'timer duration should be correct while paused');
					assert.ok(!timer.isRunning(), 'paused timer should not be running');
					assert.ok(!!Chronograph.get(8), 'timer should still be in global timers array after pause');
					timer.resume();

					wait(() => {
						assert.ok(!Chronograph.get(8), 'timer should not be in global timers array after finish');
						assert.equal(timer.getTargetDuration(), timer.getDuration(), 'after finishing the timer should have the target duration')
						assert.ok(!timer.isRunning(), 'new timer should not be running after finishing');
						assert.ok(!!events.finished, 'finished event should be emitted');
						assert.equal(timer, events.finished, 'finished event should emit correct timer');
						assert.ok(!!events.removed, 'removed event should be emitted');
						assert.equal(timer, events.removed, 'removed event should emit correct timer');

						events = {};
						done();
					}, 1050); // running
				}, 500); // running
			}, 1000); // paused
		}, 500); // running
	});

	it('should start, pause and stop a timer', function(done) {
		this.timeout(250); // the entire test should not exceed this timeout

		let name = 'test timer 5';
		let timer = new Chronograph(9, name, 1, 'days');
		timer.setData('type', ChronographType.TIMER);
		assert.ok(!!Chronograph.get(9), 'timer should be in global timers array');
		timer.start();
		assert.ok(!!events.started, 'started event should be emitted');
		assert.equal(timer, events.started, 'started event should emit correct timer');

		wait(() => {
			assert.ok(timer.isRunning(), 'timer should be running');
			timer.pause();
			assert.ok(!timer.isRunning(), 'paused timer should not be running');
			assert.ok((timer.getTargetDuration() - timer.getDuration()) > 86399850 && (timer.getTargetDuration() - timer.getDuration()) < 86399950, 'timer should be paused at the correct position');
			assert.ok(!!events.paused, 'paused event should be emitted');
			assert.equal(timer, events.paused, 'paused event should emit correct timer');

			wait(() => {
				assert.ok(!timer.isRunning(), 'paused timer should not be running');
				timer.stop();
				assert.ok(!Chronograph.get(9), 'timer should not be in global timers array after stopping');
				assert.ok(!timer.isRunning(), 'stopped timer should not be running');
				assert.ok(!!events.stopped, 'stopped event should be emitted');
				assert.equal(timer, events.stopped, 'stopped event should emit correct timer');

				events = {};
				done();
			}, 100); // paused
		}, 100); // running
	});

	it('should start, split, pause, split and stop a timer', function(done) {
		this.timeout(2300); // the entire test should not exceed this timeout

		let name = 'test timer 6';
		let timer = new Chronograph(10, name, 1, 'seconds');
		timer.setData('type', ChronographType.TIMER);
		assert.ok(!!Chronograph.get(10), 'timer should be in global timers array');
		timer.addSplit(0.2, 'seconds');
		timer.addSplit(0.4, 'seconds');
		timer.addSplit(0.7, 'seconds');
		timer.addSplit(0.8, 'seconds');
		timer.addSplit(0.9, 'seconds');
		timer.start();

		wait(() => {
			assert.ok(timer.isRunning(), 'timer should be running');
			timer.pause();
			assert.ok(!timer.isRunning(), 'paused timer should not be running');
			assert.equal(events.split, 2, 'two split events should be emitted')

			wait(() => {
				assert.equal(events.split, 2, 'splits should be paused too')
				timer.resume();

				wait(() => {
					assert.equal(events.split, 3, 'third split should come in the correct time')
					timer.stop();

					wait(() => {
						assert.equal(events.split, 3, 'splits should be stopped too')
						assert.ok(!timer.isRunning(), 'stopped timer should not be running');

						events = {};
						done();
					}, 300); // stopped
				}, 250); // running
			}, 1200); // paused
		}, 500); // running
	});

	it('should start, split, pause, adjust, start, adjust, split and finish a timer', function(done) {
		this.timeout(4150); // the entire test should not exceed this timeout

		let name = 'test timer 7';
		let timer = new Chronograph(11, name, 1, 'hours');
		timer.setData('type', ChronographType.TIMER);
		assert.ok(!!Chronograph.get(11), 'timer should be in global timers array');
		timer.addSplit(3600 - 3599.5, 'seconds');
		timer.addSplit(3600 - 3599.3, 'seconds');
		timer.addSplit(3600 - 0.5, 'seconds');
		timer.start();

		wait(() => {
			assert.ok(timer.isRunning(), 'timer should be running');
			timer.pause();
			assert.ok(!timer.isRunning(), 'paused timer should not be running');
			assert.equal(1, events.split, 'one split events should be emitted')
			timer.adjust(0.2, 'seconds'); // B)
			assert.ok(!timer.isRunning(), 'adjusted timer should not be running');

			wait(() => {
				assert.equal(1, events.split, 'one split events should be emitted')
				timer.resume();

				events = {};
				wait(() => {
					timer.adjust(-1.8, 'seconds'); // A) + B) + C)

					wait(() => {
						assert.equal(2, events.split, 'two split events should be emitted')
						timer.adjust(3598.6, 'seconds');

						wait(() => {
							assert.equal(2, events.split, 'two split events should be emitted')
							assert.equal(timer.getTargetDuration(), timer.getDuration(), 'finished timer should have a the target duration')
							assert.ok(!timer.isRunning(), 'finished timer should not be running');

							assert.ok(!events.paused, 'paused event should not be emitted');
							assert.ok(!events.resumed, 'paused event should not be emitted');
							assert.ok(!events.stopped, 'stopped event should not be emitted');
							assert.ok(!!events.finished, 'finished event should be emitted');
							assert.equal(timer, events.finished, 'finished event should emit correct timer');
							assert.ok(!Chronograph.get(11), 'timer should not be in global timers array after finish');

							events = {};
							done();
						}, 500); // running
					}, 1000); // running
				}, 1000); // running C)
			}, 1000); // paused
		}, 600); // running A)
	});

	it('should allow for multiple timers at once', function(done) {
		this.timeout(1250);

		for (var i = 1; i <= 50; i++) {
			let timer = new Chronograph(12 + i, 'bulk timer ' + i, Math.random(), 'seconds');
			timer.setData('type', ChronographType.TIMER);
		}
		let all = Chronograph.all().filter(chronograph => chronograph.getData('type') == ChronographType.TIMER);
		assert.equal(50, all.length);
		all.forEach(timer => {
			timer.start();
		});
		wait(() => {
			all = Chronograph.all().filter(chronograph => chronograph.getData('type') == ChronographType.TIMER);
			assert.equal(0, all.length);

			events = {};
			done();
		}, 1050);
	});

	it('schedules fractional splits and simultaneous target splits in order', function() {
		const timer = new Chronograph(500, 'precise splits', 1, 'seconds');
		const fired = [];
		const onSplit = (item, split) => {
			if (item === timer) fired.push([split.data, Date.now()]);
		};
		const onFinished = item => {
			if (item === timer) fired.push(['finished', Date.now()]);
		};
		Chronograph.events.on('split', onSplit);
		Chronograph.events.on('finished', onFinished);
		try {
			timer.addSplit(0.25, 'seconds', 'quarter');
			timer.addSplit(1, 'seconds', 'first');
			timer.addSplit(1, 'seconds', 'second');
			timer.start();
			clock.tick(249);
			assert.deepStrictEqual(fired, []);
			clock.tick(1);
			assert.deepStrictEqual(fired, [['quarter', 1000250]]);
			clock.tick(750);
			assert.deepStrictEqual(fired, [
				['quarter', 1000250], ['second', 1001000], ['first', 1001000], ['finished', 1001000]
			]);
		} finally {
			Chronograph.events.removeListener('split', onSplit);
			Chronograph.events.removeListener('finished', onFinished);
		}
	});

	it('generates transition splits precisely and repeats them after a backward adjustment', async function() {
		const fired = [];
		const onSplit = (item, split) => {
			if (item.getName() === 'lazy transition') fired.push([split.time, Date.now()]);
		};
		Chronograph.events.on('split', onSplit);
		try {
			await Chronograph.transition_startRunListener({ __: key => key },
				{ name: 'lazy transition', time: 1.5, unit: 'seconds', from: 0, to: 10, steps: 4 },
				{ persistFlowValues: false });
			const transition = Chronograph.all().find(item => item.getName() === 'lazy transition');
			assert.strictEqual(transition._splits.length, 0);
			clock.tick(500);
			transition.pause();
			transition.adjust(-0.5, 'seconds');
			transition.resume();
			clock.tick(1000);
			assert.deepStrictEqual(fired, [[500, 1000500], [500, 1001000], [1000, 1001500]]);
			clock.tick(500);
			assert.strictEqual(Chronograph.get(transition.getId()), false);
		} finally {
			Chronograph.events.removeListener('split', onSplit);
		}
	});

	it('keeps transition scheduling memory independent of the number of steps', async function() {
		await Chronograph.transition_startRunListener({ __: key => key },
			{ name: 'many steps', time: 3600, unit: 'seconds', from: 0, to: 1, steps: 10000 },
			{ persistFlowValues: false });
		const transition = Chronograph.all().find(item => item.getName() === 'many steps');
		assert.strictEqual(transition._splits.length, 0);
		assert.strictEqual(transition._orderedSplits.length, 0);
		assert.strictEqual(transition._transitionSplits.count, 9998);
	});

	it('fires fractional transition steps at the first whole millisecond after each deadline', async function() {
		const fired = [];
		const onSplit = (item, split) => {
			if (item.getName() === 'fractional transition') fired.push([split.time, Date.now()]);
		};
		Chronograph.events.on('split', onSplit);
		try {
			await Chronograph.transition_startRunListener({ __: key => key },
				{ name: 'fractional transition', time: 1, unit: 'seconds', from: 0, to: 1, steps: 4 },
				{ persistFlowValues: false });
			clock.tick(333);
			assert.strictEqual(fired.length, 0);
			clock.tick(1);
			clock.tick(333);
			assert.deepStrictEqual(fired, [[1000 / 3, 1000334], [2 * 1000 / 3, 1000667]]);
		} finally {
			Chronograph.events.removeListener('split', onSplit);
		}
	});

	it('stops periodic updates while idle and resumes them when a chronograph runs', function() {
		const updates = [];
		Chronograph.homey.api = { realtime: (event, data) => {
			updates.push({ event, data });
			return Promise.resolve();
		} };
		Chronograph._resetUpdateTimeout();
		assert.strictEqual(timeouts.length, 0);

		const timer = new Chronograph(706, 'idle updates', 60, 'seconds');
		timer.start();
		clock.tick(1000);
		assert.strictEqual(updates.length, 1);
		timer.pause();
		clock.tick(1000);
		assert.strictEqual(updates.length, 1);
		assert.strictEqual(timeouts.length, 0);

		timer.resume();
		clock.tick(1000);
		assert.strictEqual(updates.length, 2);
		timer.stop();
		clock.tick(1000);
		assert.strictEqual(timeouts.length, 0);
	});

	it('does not rescan unrelated chronographs when a deadline approaches or fires', function() {
		let unrelatedReads = 0;
		for (let i = 0; i < 20; i++) {
			const timer = new Chronograph(600 + i, 'long timer', 1, 'hours');
			timer.addSplit(30, 'minutes');
			timer.start();
			const getDuration = timer.getDuration.bind(timer);
			timer.getDuration = () => {
				unrelatedReads++;
				return getDuration();
			};
		}
		const shortTimer = new Chronograph(700, 'short timer', 10, 'seconds');
		shortTimer.start();
		clock.tick(9999);
		assert.ok(shortTimer.isRunning());
		clock.tick(1);
		assert.strictEqual(Chronograph.get(700), false);
		assert.strictEqual(unrelatedReads, 0);
	});

	it('reschedules splits changed by a split listener', function() {
		const timer = new Chronograph(701, 'reentrant splits', 2, 'seconds');
		const fired = [];
		const onSplit = (item, split) => {
			if (item !== timer) return;
			fired.push([split.data, Date.now()]);
			if (split.data === 'first') {
				timer.addSplit(0.4, 'seconds', 'added');
				timer.pause();
			}
		};
		Chronograph.events.on('split', onSplit);
		try {
			timer.addSplit(0.25, 'seconds', 'first');
			timer.start();
			clock.tick(250);
			assert.strictEqual(timer.isRunning(), false);
			clock.tick(1000);
			assert.strictEqual(fired.length, 1);
			timer.resume();
			clock.tick(149);
			assert.strictEqual(fired.length, 1);
			clock.tick(1);
			assert.deepStrictEqual(fired, [['first', 1000250], ['added', 1001400]]);
		} finally {
			Chronograph.events.removeListener('split', onSplit);
		}
	});

	it('processes overdue splits before finishing after a delayed callback', function() {
		const timer = new Chronograph(705, 'delayed timer', 1, 'seconds');
		const fired = [];
		const onSplit = (item, split) => {
			if (item === timer) fired.push(split.data);
		};
		const onFinished = item => {
			if (item === timer) fired.push('finished');
		};
		Chronograph.events.on('split', onSplit);
		Chronograph.events.on('finished', onFinished);
		try {
			timer.addSplit(0.25, 'seconds', 'first');
			timer.addSplit(0.5, 'seconds', 'second');
			timer.addSplit(1, 'seconds', 'target');
			timer.start();
			clock.elapseWithoutCallbacks(1500);
			clock.tick(0);
			assert.deepStrictEqual(fired, ['first', 'second', 'target', 'finished']);
			assert.strictEqual(timer.getDuration(), 1000);
		} finally {
			Chronograph.events.removeListener('split', onSplit);
			Chronograph.events.removeListener('finished', onFinished);
		}
	});

	it('ignores stale callbacks after pausing or replacing a chronograph', function() {
		const timer = new Chronograph(702, 'original', 1, 'seconds');
		timer.start();
		const staleBeforePause = timeouts[0].callback;
		clock.tick(100);
		timer.pause();
		timer.resume();
		staleBeforePause();
		assert.ok(timer.isRunning());
		const staleBeforeReplace = timeouts[0].callback;
		const replacement = new Chronograph(702, 'replacement', 2, 'seconds');
		replacement.start();
		staleBeforeReplace();
		clock.tick(900);
		assert.strictEqual(Chronograph.get(702), replacement);
		clock.tick(1100);
		assert.strictEqual(Chronograph.get(702), false);
	});

	it('rechecks long deadlines after forward and backward wall-clock changes', function() {
		const forward = new Chronograph(703, 'forward clock', 60, 'seconds');
		forward.start();
		clock.tick(10000);
		clock.shiftWall(50000);
		clock.tick(19999);
		assert.ok(forward.isRunning());
		clock.tick(1);
		assert.strictEqual(Chronograph.get(703), false);

		const backward = new Chronograph(704, 'backward clock', 30, 'seconds');
		backward.start();
		clock.tick(10000);
		clock.shiftWall(-10000);
		clock.tick(20000);
		assert.ok(backward.isRunning());
		clock.tick(9999);
		assert.ok(backward.isRunning());
		clock.tick(1);
		assert.strictEqual(Chronograph.get(704), false);
	});

	it('should schedule elapsed and remaining timer splits at their correct points', function() {
		const timer = new Chronograph(999, 'split direction test', 10, 'seconds');
		timer.setData('type', ChronographType.TIMER);

		Chronograph.addTimerSplits(timer, {
			settings: {
				get: key => ({
					timer_splits: [{ name: 'split direction test', time: 3, unit: 'seconds' }],
					timer_elapsed_splits: [{ name: 'split direction test', time: 2, unit: 'seconds' }]
				})[key]
			}
		});

		assert.deepStrictEqual(timer._splits.map(split => [split.time, split.unit, split.data.timerSplitType]), [
			[7000, 'milliseconds', 'remaining'],
			[2, 'seconds', 'elapsed']
		]);
		delete Chronograph._chronographs[timer.getId()];
	});

	it('should allow for multiple timers with splits at once', function(done) {
		this.timeout(4000);

		let splits = 0;
		const timerCount = 20;
		for (let i = 1; i <= timerCount; i++) {
			let timer = new Chronograph(1000 + i, 'bulk timer ' + i, 0.5, 'seconds');
			timer.setData('type', ChronographType.TIMER);
			timer.addSplit(0.1, 'seconds');
			splits++;
		}
		let all = Chronograph.all().filter(chronograph => chronograph.getData('type') == ChronographType.TIMER);
		assert.equal(timerCount, all.length);
		all.forEach(timer => {
			timer.start();
		});
		const startedAt = Date.now();
		const checkTimers = () => {
			all = Chronograph.all().filter(chronograph => chronograph.getData('type') == ChronographType.TIMER);
			if (all.length && Date.now() - startedAt < 3000) {
				wait(checkTimers, 100);
				return;
			}
			try {
				assert.equal(0, all.length, 'all timers should have finished');
				assert.equal(splits, events.split, 'all splits should have been executed');
			} catch (error) {
				done(error);
				return;
			}
			events = {};
			done();
		};
		wait(checkTimers, 100);
	});
});
