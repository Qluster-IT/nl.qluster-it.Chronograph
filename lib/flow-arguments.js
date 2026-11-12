'use strict';

const { BL } = require('betterlogiclibrary');

const durationTextCards = new Set([
	'timer_start_v2', 'timer_resume_v2', 'timer_adjust_v2',
	'stopwatch_adjust_v2', 'transition_start', 'transition_resume', 'transition_adjust'
]);

async function decodeFlowArguments(args, cardId) {
	let decoded = args;
	const decode = async key => {
		if (typeof args[key] !== 'string') return;
		const value = await BL.decode(args[key]);
		if (value !== args[key]) {
			if (decoded === args) decoded = { ...args };
			decoded[key] = value;
		}
	};
	if (!args.namedd) await decode('name');
	if (durationTextCards.has(cardId)) await decode('time');
	return decoded;
}

function registerFlowRunListener(card, cardId, listener) {
	card.registerRunListener(async (args, ...rest) => listener(await decodeFlowArguments(args, cardId), ...rest));
}

async function resolveSplitNames(homey, setting) {
	const splits = homey.settings.get(setting) || [];
	return Promise.all(splits.map(async split => {
		if (split.namedd) return { ...split, name: split.namedd.name };
		if (typeof split.name !== 'string') return split;
		const name = await BL.decode(split.name);
		return name === split.name ? split : { ...split, name };
	}));
}

module.exports = { BL, decodeFlowArguments, registerFlowRunListener, resolveSplitNames };
