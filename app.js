'use strict';

const Homey = require('homey');
const Chronograph = require('./lib/chronograph.js');
const { Utils, ChronographType, LogLevel } = require('./lib/utils.js');

// Actions.
const TimerGetDuration = require('./lib/timer/actions/timer_get_duration.js');
const TimerStart = require('./lib/timer/actions/timer_start.js');
const TimerResume = require('./lib/timer/actions/timer_resume.js');
const TimerAdjust = require('./lib/timer/actions/timer_adjust.js');
const TimerPause = require('./lib/timer/actions/timer_pause.js');
const TimerStop = require('./lib/timer/actions/timer_stop.js');
const TimerStopAll = require('./lib/timer/actions/timer_stop_all.js');
const StopwatchGetDuration = require('./lib/stopwatch/actions/stopwatch_get_duration.js');
const StopwatchStart = require('./lib/stopwatch/actions/stopwatch_start.js');
const StopwatchResume = require('./lib/stopwatch/actions/stopwatch_resume.js');
const StopwatchAdjust = require('./lib/stopwatch/actions/stopwatch_adjust.js');
const StopwatchPause = require('./lib/stopwatch/actions/stopwatch_pause.js');
const StopwatchStop = require('./lib/stopwatch/actions/stopwatch_stop.js');
const StopwatchStopAll = require('./lib/stopwatch/actions/stopwatch_stop_all.js');
const TransitionGetDuration = require('./lib/transition/actions/transition_get_duration.js');
const TransitionStart = require('./lib/transition/actions/transition_start.js');
const TransitionResume = require('./lib/transition/actions/transition_resume.js');
const TransitionAdjust = require('./lib/transition/actions/transition_adjust.js');
const TransitionPause = require('./lib/transition/actions/transition_pause.js');
const TransitionStop = require('./lib/transition/actions/transition_stop.js');
const TransitionStopAll = require('./lib/transition/actions/transition_stop_all.js');
const ResumeChronograph = require('./lib/generic/actions/resume_chronograph.js');

// Conditions.
const TimerCompare = require('./lib/timer/conditions/timer_compare.js');
const TimerRunning = require('./lib/timer/conditions/timer_running.js');
const StopwatchCompare = require('./lib/stopwatch/conditions/stopwatch_compare.js');
const StopwatchRunning = require('./lib/stopwatch/conditions/stopwatch_running.js');
const TransitionCompare = require('./lib/transition/conditions/transition_compare.js');
const TransitionRunning = require('./lib/transition/conditions/transition_running.js');
const DelayPassed = require('./lib/generic/conditions/delay_passed.js');

// Triggers.
const TimerStarted = require('./lib/timer/triggers/timer_started.js');
const TimerSplit = require('./lib/timer/triggers/timer_split.js');
const TimerElapsed = require('./lib/timer/triggers/timer_elapsed.js');
const TimerFinished = require('./lib/timer/triggers/timer_finished.js');
const TimerStopped = require('./lib/timer/triggers/timer_stopped.js');
const TimerPaused = require('./lib/timer/triggers/timer_paused.js');
const StopwatchStarted = require('./lib/stopwatch/triggers/stopwatch_started.js');
const StopwatchSplit = require('./lib/stopwatch/triggers/stopwatch_split.js');
const StopwatchStopped = require('./lib/stopwatch/triggers/stopwatch_stopped.js');
const StopwatchPaused = require('./lib/stopwatch/triggers/stopwatch_paused.js');
const TransitionStarted = require('./lib/transition/triggers/transition_started.js');
const TransitionSplit = require('./lib/transition/triggers/transition_split.js');
const TransitionFinished = require('./lib/transition/triggers/transition_finished.js');
const TransitionStopped = require('./lib/transition/triggers/transition_stopped.js');
const TransitionPaused = require('./lib/transition/triggers/transition_paused.js');

/**
 * Lowercase key used to group configured chronographs by kind.
 * @typedef {'timer' | 'stopwatch' | 'transition'} ChronographCategory
 */

/**
 * A chronograph name configured in a Flow card and persisted in app settings.
 * @typedef {Object} ChronographConfiguration
 * @property {string} name User-configured chronograph name.
 * @property {number} [action] Timestamp in milliseconds of the last chronograph event.
 */

/**
 * Configured chronographs, grouped by their lowercase kind.
 * @typedef {Object.<ChronographCategory, ChronographConfiguration[]>} ChronographConfigurationMap
 */

/**
 * A chronograph state snapshot persisted for restoring active chronographs.
 * @typedef {Object} ChronographActiveSnapshot
 * @property {string} id Generated chronograph identifier.
 * @property {string} name Configured chronograph name.
 * @property {number} duration Elapsed duration in milliseconds when captured.
 * @property {number} targetDuration Target duration in milliseconds, or a falsy value when unset.
 * @property {Object.<string, *>} data Chronograph metadata required to restore its type and settings.
 * @property {boolean} running Whether the chronograph was running when captured.
 * @property {boolean} removed Whether the chronograph was removed in the captured event.
 * @property {number} now Capture timestamp in milliseconds.
 * @property {number} remaining Remaining duration in milliseconds.
 * @property {number} elapsed Elapsed duration in milliseconds.
 */

/**
 * An item returned by the widget chronograph-name autocomplete listener.
 * @typedef {Object} ChronographWidgetAutocompleteItem
 * @property {string} name Displayed chronograph name.
 * @property {string} id Generated chronograph identifier.
 * @property {ChronographCategory} type Widget chronograph kind.
 * @property {string} chronographName Configured chronograph name.
 * @property {{type: string, name: string}} data Chronograph type and name passed to the widget.
 */

/**
 * A chronograph name suggestion returned to a Flow-card autocomplete field.
 * @typedef {Object} ChronographNameAutocompleteItem
 * @property {string} name Suggested chronograph name.
 * @property {string} description Localized text identifying an existing or new name.
 */

/**
 * A registered Flow card paired with its manifest definition.
 * @typedef {Object} ChronographFlowCardBinding
 * @property {Object} card Homey Flow card instance.
 * @property {Object} flowcard Flow card manifest definition.
 */

/**
 * Homey application state and Flow-card registration for Chronograph.
 * @property {ChronographConfigurationMap} [chronographs] Configured chronographs grouped by kind.
 * @property {ChronographConfigurationMap} [oldChronographs] Previous configuration used while refreshing Flow-card names.
 * @property {Object.<string, ChronographFlowCardBinding[]>} [chronographsCards] Flow cards indexed by chronograph kind.
 * @property {Object.<string, Object>} [_cards] Registered action, condition, and trigger cards indexed by ID.
 * @property {number} [roundOfDurationsFlowcards] Decimal places used for Flow-card duration values.
 */
class Application extends Homey.App {

	constructor() {
		super();
		/** @type {ChronographConfigurationMap} */
		this.chronographs = {};
	}

	onInit() {
		this.log('OnInit (sync)');

		this.onInitLoader().catch(x => this.error('OnInit loaded catch', x));
	}
	async onInitLoader() {
		//Application.homey = this.homey;
		this.log('onInitLoader');
		// Initializing cards.
		//if (process.env.DEBUG === '1') require('inspector').open(9228, '0.0.0.0', true);
		if (process.env.DEBUG === '1' || false) {
			try {
				require('inspector').waitForDebugger();
			}
			catch (error) {
				require('inspector').open(9210, '0.0.0.0', true);
			}
		}

		try {

			Chronograph.homey = this.homey;
			this.setRoundOfDurationsFlowcards();

			this.log('Initializing cards.');
			this._initializeTimerCards();
			this._initializeStopwatchCards();
			this._initializeTransitionCards();
			this._initializeGenericCards();
			this._registerChronographWidgetAutocomplete();



			// Install event handlers.
			this.log('Installing event handlers.');
			this._installLogEventHandler();
			this._installEventHandlers();

			// Restore chronographs from settings after the application has started.
			this.homey.setTimeout(async () => {

				try {
					/** @type {Object.<string, ChronographFlowCardBinding[]>} */
					this.chronographsCards = {};
					await this._initializeChronographsFromFlowArguments();
				} catch (error) {
					this.homey.error('_initializeChronographsFromFlowArguments', error)
				}

				this.log('Restoring chronographs.');
				this._restoreChronographs();

			}, 1000);

			this.log('Chronograph.all', Chronograph.all());

			this.log('Application is running.');

			this.homey.settings.on('set', async (settingName) => {
				if (settingName == 'roundOfDurationsFlowcards') {
					this.setRoundOfDurationsFlowcards();
				}
			});

		} catch (error) {
			this.homey.error('app init', error)
		}
	}

	_registerChronographWidgetAutocomplete() {
		['timer', 'transition', 'stopwatch'].forEach(type => {
			const widget = this.homey.dashboards.getWidget(type);
			widget.registerSettingAutocompleteListener('chronograph', async (query) => {
				const chronographType = ChronographType[type.toUpperCase()];
				const search = (query || '').toLowerCase();
				return (this.chronographs && this.chronographs[type] || [])
					.map(chronograph => typeof chronograph === 'string' ? { name: chronograph } : chronograph)
					.filter(chronograph => chronograph.name && chronograph.name.toLowerCase().includes(search))
					.map(chronograph => {
						/** @type {ChronographWidgetAutocompleteItem} */
						const item = {
							name: chronograph.name,
							id: Utils.generateId(chronographType, chronograph.name),
							type,
							chronographName: chronograph.name,
							data: {
								type: chronographType,
								name: chronograph.name
							}
						};
						return item;
					});
			});
		});
	}

	setRoundOfDurationsFlowcards() {
		this.roundOfDurationsFlowcards = this.homey.settings.get('roundOfDurationsFlowcards');
		if (this.roundOfDurationsFlowcards === null || this.roundOfDurationsFlowcards === undefined || !Number.isInteger(this.roundOfDurationsFlowcards)) this.homey.settings.set('roundOfDurationsFlowcards', (this.roundOfDurationsFlowcards = 2));
	}

	getTimeAsString(durationInMs, returnType) {
		var milliseconds = Math.floor((durationInMs % 1000) / 100),
			seconds = Math.floor((durationInMs / 1000) % 60),
			minutes = Math.floor((durationInMs / (1000 * 60)) % 60),
			hours = Math.floor((durationInMs / (1000 * 60 * 60)) % 24);

		hours = (hours < 10) ? "0" + hours : hours;
		minutes = (minutes < 10) ? "0" + minutes : minutes;
		seconds = (seconds < 10) ? "0" + seconds : seconds;
		switch (returnType) {
			case 'mm:ss': return minutes + ":" + seconds;
			case 'HH:mm': return hours + ":" + minutes;

			case 'HH:mm:ss':
			default:
				return hours + ":" + minutes + ":" + seconds;

		}
	}

	saveChronographs() {
		this.homey.settings.set('chronographs', this.chronographs);
	}



	async _initializeChronographsFromFlowArguments() {
		this.chronographs = {};
		/** @type {ChronographConfigurationMap | undefined} Previously saved chronograph settings. */
		this.oldChronographs = this.homey.settings.get('chronographs');
		for (const flowTypeId in this.homey.manifest.flow) {
			if (Object.hasOwnProperty.call(this.homey.manifest.flow, flowTypeId)) {
				const flowType = this.homey.manifest.flow[flowTypeId];
				let type = flowTypeId == 'actions' ? 'Action' : flowTypeId == 'conditions' ? 'Condition' : 'Trigger';
				for (const flowcard of flowType) {
					let nameArg;
					if (flowcard.args && (nameArg = flowcard.args.find(x => x.name == 'name'))) switch (type) {
						case "Action":
						case "Trigger":
						case "Condition":
							let chronograph_type = flowcard.id.split('_')[0];
							const card = this.homey.flow['get' + type + 'Card'](flowcard.id)
							if (flowcard.args.find(x => x.name == 'namedd')) card.getArgument('namedd').registerAutocompleteListener(async (query, args) => {

								if (!this.chronographs[chronograph_type]) this.chronographs[chronograph_type] = [];
								let l = this.chronographs[chronograph_type];
								if (query) l = l.filter(x => x.name.toLowerCase().indexOf(query.toLowerCase()) > -1);
								l = l.sort();
								l = l.map(x => {
									/** @type {ChronographNameAutocompleteItem} */
									const item = {
										name: x.name,
										description: this.homey.__("existing")
									}
									return item;
								});
								if (query && !this.chronographs[chronograph_type].find(x => x.name == query)) {
									/** @type {ChronographNameAutocompleteItem} */
									const newName = { name: query, description: this.homey.__("new") };
									l.unshift(newName);
								}
								return l;

							});
							if (!this.chronographsCards[chronograph_type]) this.chronographsCards[chronograph_type] = [];
							/** @type {ChronographFlowCardBinding} */
							const binding = { card, flowcard };
							this.chronographsCards[chronograph_type].push(binding);
							await this.setArgumentNames(card, flowcard, true);
							card.on('update', async () => {
								await this.setArgumentNames(card, flowcard);
							});;
							break;

						default:
							break;
					}
				}
			}
		}
		delete this.oldChronographs;
	}

	async setArgumentNamesCard(card, type) {
		let args = await card.getArgumentValues();
		let names = [];
		let nameArgs = args.filter(x => x.name);
		if (nameArgs.length) names = names.concat(nameArgs.map(x => x.name));

		let nameDdArgs = args.filter(x => x.namedd);
		if (nameDdArgs.length) names = names.concat(nameDdArgs.map(x => x.namedd.name));
		names = names.filter(x => !(x.startsWith('[[') && x.endsWith(']]')));
		//names.concat() = ;

		let changed = false;
		for (let i = 0; i < names.length; i++)
			if (names[i] && !this.chronographs[type].find(x => x.name == names[i])) {
				let oldChronograph = this.oldChronographs && this.oldChronographs[type] ? this.oldChronographs[type].find(x => x.name == names[i]) : undefined;
				/** @type {ChronographConfiguration} */
				let chrono = { name: names[i] };
				if (oldChronograph) chrono.action = oldChronograph.action;
				this.chronographs[type].push(chrono) & (changed = true);
			}
		return changed;
	}
	async setArgumentNames(card, flowcard, firstRun) {
		try {

			//this.log('setArgumentNames');
			if (!this.chronographs) this.chronographs = {};
			let type = flowcard.id.split('_')[0];
			if (firstRun) {
				if (!this.chronographs[type]) this.chronographs[type] = [];
			} else {
				this.oldChronographs = this.chronographs;
				this.chronographs[type] = [];
			}

			let changed = false;
			if (firstRun) changed = await this.setArgumentNamesCard(card, type);
			else for (const obj of this.chronographsCards[type]) {
				let card = obj.card;
				if (await this.setArgumentNamesCard(card, type)) changed = true;
			}
			if (changed) this.homey.settings.set('chronographs', this.chronographs);
			if (!firstRun) delete this.oldChronographs;
		} catch (error) {
			this.homey.error('setArgumentNames error', error);
		}

	}
	// async readChronographsFromFlowArguments() {
	// 	for (const flowTypeId in this.homey.manifest.flow) {
	// 		if (Object.hasOwnProperty.call(this.homey.manifest.flow, flowTypeId)) {
	// 			const flowType = this.homey.manifest.flow[flowTypeId];

	// 			let type = flowTypeId == 'actions' ? 'Action' : flowTypeId == 'conditions' ? 'Condition' : 'Trigger';
	// 			for (const flowcard of flowType) {
	// 				if (flowcard.args && flowcard.args.find(x => x.name === 'variable' && x.type === 'autocomplete')) {
	// 					if (!this.cards[flowcard.id]) {
	// 						this.cards[flowcard.id] = { card: await this.homey.flow['get' + type + 'Card'](flowcard.id), names: [], id: flowcard.id };
	// 					}
	// 					await this.setArgumentNames(this.cards[flowcard.id]);
	// 					this.cards[flowcard.id].card.on('update', async () => {
	// 						await this.setArgumentNames(this.cards[flowcard.id]);
	// 						await this.setVariablesFromArguments();
	// 					});
	// 				}
	// 			}
	// 		}
	// 	}
	// };

	_initializeTimerCards() {
		/** @type {Object.<string, Object>} Registered timer Flow cards, indexed by manifest ID. */
		this._cards = {
			// Actions.
			"timer_get_duration": new TimerGetDuration("timer_get_duration", this.homey),
			"timer_start": new TimerStart('timer_start', this.homey),
			"timer_start_v2": new TimerStart('timer_start_v2', this.homey),
			"timer_resume": new TimerResume('timer_resume', this.homey),
			"timer_resume_v2": new TimerResume('timer_resume_v2', this.homey),
			"timer_adjust": new TimerAdjust('timer_adjust', this.homey),
			"timer_adjust_v2": new TimerAdjust('timer_adjust_v2', this.homey),
			"timer_pause": new TimerPause('timer_pause', this.homey),
			"timer_stop": new TimerStop('timer_stop', this.homey),
			"timer_stop_all": new TimerStopAll('timer_stop_all', this.homey),
			"timer_resume_existing": new ResumeChronograph('timer_resume_existing', this.homey, ChronographType.TIMER),

			// Conditions.
			"timer_compare": new TimerCompare("timer_compare", this.homey),
			"timer_running": new TimerRunning("timer_running", this.homey),

			// Triggers.
			"timer_started": new TimerStarted('timer_started', this.homey),
			"timer_split": new TimerSplit('timer_split', this.homey),
			"timer_elapsed": new TimerElapsed('timer_elapsed', this.homey),
			"timer_finished": new TimerFinished('timer_finished', this.homey),
			"timer_stopped": new TimerStopped('timer_stopped', this.homey),
			"timer_paused": new TimerPaused('timer_paused', this.homey)
		};
	}

	_initializeStopwatchCards() {
		/** @type {Object.<string, Object>} Registered stopwatch Flow cards, indexed by manifest ID. */
		this._cards = {
			// Actions.
			"stopwatch_get_duration": new StopwatchGetDuration("stopwatch_get_duration", this.homey),
			"stopwatch_start": new StopwatchStart('stopwatch_start', this.homey),
			"stopwatch_resume": new StopwatchResume('stopwatch_resume', this.homey),
			"stopwatch_adjust": new StopwatchAdjust('stopwatch_adjust', this.homey),
			"stopwatch_adjust_v2": new StopwatchAdjust('stopwatch_adjust_v2', this.homey),
			"stopwatch_pause": new StopwatchPause('stopwatch_pause', this.homey),
			"stopwatch_stop": new StopwatchStop('stopwatch_stop', this.homey),
			"stopwatch_stop_all": new StopwatchStopAll('stopwatch_stop_all', this.homey),
			"stopwatch_resume_existing": new ResumeChronograph('stopwatch_resume_existing', this.homey, ChronographType.STOPWATCH),

			// Conditions.
			"stopwatch_compare": new StopwatchCompare("stopwatch_compare", this.homey),
			"stopwatch_running": new StopwatchRunning("stopwatch_running", this.homey),

			// Triggers.
			"stopwatch_started": new StopwatchStarted('stopwatch_started', this.homey),
			"stopwatch_split": new StopwatchSplit('stopwatch_split', this.homey),
			"stopwatch_stopped": new StopwatchStopped('stopwatch_stopped', this.homey),
			"stopwatch_paused": new StopwatchPaused('stopwatch_paused', this.homey)
		};
	}

	_initializeTransitionCards() {
		/** @type {Object.<string, Object>} Registered transition Flow cards, indexed by manifest ID. */
		this._cards = {
			// Actions.
			"transition_get_duration": new TransitionGetDuration("transition_get_duration", this.homey),
			"transition_start": new TransitionStart('transition_start', this.homey),
			"transition_resume": new TransitionResume('transition_resume', this.homey),
			"transition_adjust": new TransitionAdjust('transition_adjust', this.homey),
			"transition_pause": new TransitionPause('transition_pause', this.homey),
			"transition_stop": new TransitionStop('transition_stop', this.homey),
			"transition_stop_all": new TransitionStopAll('transition_stop_all', this.homey),
			"transition_resume_existing": new ResumeChronograph('transition_resume_existing', this.homey, ChronographType.TRANSITION),

			// Conditions.
			"transition_compare": new TransitionCompare("transition_compare", this.homey),
			"transition_running": new TransitionRunning("transition_running", this.homey),

			// Triggers.
			"transition_started": new TransitionStarted('transition_started', this.homey),
			"transition_split": new TransitionSplit('transition_split', this.homey),
			"transition_finished": new TransitionFinished('transition_finished', this.homey),
			"transition_stopped": new TransitionStopped('transition_stopped', this.homey),
			"transition_paused": new TransitionPaused('transition_paused', this.homey)
		};
	}

	_initializeGenericCards() {
		/** @type {Object.<string, Object>} Registered generic Flow cards, indexed by manifest ID. */
		this._cards = {
			// Actions.

			// Conditions.
			"delay_passed": new DelayPassed("delay_passed", this.homey),

			// Triggers.
		};
	}

	_installLogEventHandler() {
		Chronograph.events.on('log', (chronograph, text, level) => {
			if (level >= LogLevel.WARNING) {
				if (chronograph) this.error('[' + chronograph.getData('type') + '] [' + chronograph.getName() + '] ' + text);
				else this.error(text);
			} else {
				if (chronograph) this.log('[' + chronograph.getData('type') + '] [' + chronograph.getName() + '] ' + text);
				else this.log(text);
			}
		});
	}

	_installEventHandlers() {
		Chronograph.events.mon(['created', 'started', 'resumed', 'paused', 'updated', 'removed'], (event, chronograph) => { //, 'realtime_update'
			try {

				//this.log('Chronograph.events.mon( ', event)
				let target = chronograph.getTargetDuration();
				let elapsed = chronograph.getDuration();
				let remaining = target - elapsed;

				/** @type {ChronographActiveSnapshot} State saved for realtime updates and restart recovery. */
				let raw = {
					id: chronograph.getId(),
					name: chronograph.getName(),
					duration: elapsed,//chronograph.getDuration(),
					targetDuration: target,//chronograph.getTargetDuration(),
					data: chronograph.getAllData(),
					running: chronograph.isRunning(),
					removed: event == 'removed',
					now: (new Date()).getTime(),
					remaining,
					elapsed,
				};

				this.homey.api.realtime('chronograph_event', raw).catch(() => { }).then(() => { });
				/** @type {Object.<string, ChronographActiveSnapshot>} Active snapshots indexed by chronograph ID. */
				let active = this.homey.settings.get('chronographs_active') || {};
				if (event == 'removed') {
					delete (active[chronograph.getId()]);
				} else {
					active[chronograph.getId()] = raw;
				}
				this.homey.settings.set('chronographs_active', active);

				try {

					let type = (chronograph.getData('type') || '').toLowerCase();
					if(!type) {
						type = chronograph.getId().split('_');
						type = type[1];
					}
					let chrono = Chronograph.homey.app.chronographs[type].find(x => x.name == raw.name);
					chrono.action = raw.now;
					Chronograph.homey.app.saveChronographs();
				} catch (error) {

					this.homey.error('_installEventHandlers gettype', event, 'error', error);
				}

			} catch (error) {
				this.homey.error('_installEventHandlers', event, 'error', error);
			}
		});
	}

	_restoreChronographs() {
		try {
			/** @type {Object.<string, ChronographActiveSnapshot>} Active snapshots to restore after startup. */
			let active = this.homey.settings.get('chronographs_active') || {};
			this.homey.settings.set('chronographs_active', {});
			Object.values(active).forEach(raw => {
				// Create the correct type of chronograph.
				if (!raw.data || !raw.data.type || !raw.name) {
					return;
				}
				let id = Utils.generateId(raw.data.type, raw.name);
				let chronograph;
				if (raw.targetDuration) {
					chronograph = new Chronograph(id, raw.name, raw.targetDuration, 'milliseconds');
				} else {
					chronograph = new Chronograph(id, raw.name);
				}
				chronograph.setData('type', raw.data.type);

				// Add the splits.
				if (raw.data.type == ChronographType.TIMER) {
					Chronograph.addTimerSplits(chronograph, this.homey);
				}

				if (raw.data.type == ChronographType.STOPWATCH) {
					let splits = this.homey.settings.get('stopwatch_splits') || [];
					splits
						.filter(split => split.name == chronograph.getName())
						.forEach(split => chronograph.addSplit(split.time, split.unit, split));
				}

				if (raw.data.type == ChronographType.TRANSITION) {
					let steps = raw.data.steps--;
					let stepDuration = chronograph.getTargetDuration() / steps;
					while (--steps > 0) {
						chronograph.addSplit(steps * stepDuration, 'milliseconds');
					}
				}

				// Move to exact duration, taking the offline time into account.
				let duration = raw.duration;
				if (raw.running) {
					duration += ((new Date()).getTime() - raw.now);
				}
				chronograph.adjust(duration, 'milliseconds', true);

				// Start chronograph if it was running before.
				if (raw.running) {
					chronograph.start();
				}
			});


			this.homey.setTimeout(() => {
				Chronograph._resetUpdateTimeout();
			}, 5000);


		} catch (error) {
			this.homey.error('_restoreChronographs', 'error', error);
		}
	}
}

module.exports = Application;
