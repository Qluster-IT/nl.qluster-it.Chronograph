'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

describe('Homey Compose locales', () => {
	it('provides 50 ms guidance and the new unit on timed trigger cards without changing their default', () => {
		const languages = ['en', 'nl', 'da', 'de', 'es', 'fr', 'it', 'no', 'sv', 'pl', 'ru', 'ko', 'ar'];
		for (const file of ['4_stopwatch_split.json', '4_timer_split.json', '4_timer_elapsed.json', '6_interval_elapsed.json']) {
			const source = require(path.join('..', '.homeycompose', 'flow', 'triggers', file));
			const generated = require('../app.json').flow.triggers.find(card => card.id === source.id);
			const values = source.args.find(arg => arg.name === 'unit').values;
			assert.deepStrictEqual(generated, source);
			assert.strictEqual(values[0].id, 'seconds');
			assert.strictEqual(values[values.length - 1].id, 'milliseconds');
			for (const language of languages) {
				assert.ok(source.hint[language].includes('50'), `${file}: ${language}: hint`);
				assert.ok(values[values.length - 1].label[language], `${file}: ${language}: label`);
			}
		}
	});

	it('provides the millisecond unit and 50 ms guidance on timed start and resume actions', () => {
		const languages = ['en', 'nl', 'da', 'de', 'es', 'fr', 'it', 'no', 'sv', 'pl', 'ru', 'ko', 'ar'];
		for (const file of ['0_timer_start.json', '0_timer_start_v2.json', '0_transition_start.json',
			'2_timer_resume.json', '2_timer_resume_v2.json', '2_transition_resume.json']) {
			const source = require(path.join('..', '.homeycompose', 'flow', 'actions', file));
			const generated = require('../app.json').flow.actions.find(card => card.id === source.id);
			const values = source.args.find(arg => arg.name === 'unit').values;
			assert.deepStrictEqual(generated, source);
			assert.strictEqual(values[0].id, 'seconds');
			assert.strictEqual(values[values.length - 1].id, 'milliseconds');
			for (const language of languages) {
				assert.ok(source.hint[language].includes('50'), `${file}: ${language}: hint`);
				assert.ok(values[values.length - 1].label[language], `${file}: ${language}: label`);
			}
		}
	});

	it('keeps French timer and stopwatch terminology distinct in plain and formatted action titles', () => {
		const actions = require('../app.json').flow.actions;
		for (const [file, word, otherWord] of [
			['5_timer_stop.json', 'minuteur', 'chronomètre'],
			['2_timer_resume.json', 'minuteur', 'chronomètre'],
			['5_stopwatch_stop.json', 'chronomètre', 'minuteur'],
			['2_stopwatch_resume.json', 'chronomètre', 'minuteur']
		]) {
			const source = require(path.join('..', '.homeycompose', 'flow', 'actions', file));
			const generated = actions.find(action => action.id === source.id);
			for (const key of ['title', 'titleFormatted']) {
				assert.ok(source[key].fr.includes(word), `${file}: ${key}: ${word}`);
				assert.ok(!source[key].fr.includes(otherWord), `${file}: ${key}: not ${otherWord}`);
				assert.strictEqual(generated[key].fr, source[key].fr, `${file}: generated ${key}`);
				const placeholders = text => (text.match(/\[\[[^\]]+\]\]/g) || []).sort();
				assert.deepStrictEqual(placeholders(source[key].fr), placeholders(source[key].en), `${file}: ${key}: placeholders`);
			}
		}
	});

	it('provides all base and settings translations in the Compose sources', () => {
		const root = path.join(__dirname, '..');
		const sourceDir = path.join(root, '.homeycompose', 'locales');
		const locales = fs.readdirSync(sourceDir).filter(file => /^[a-z]+\.json$/.test(file));
		const languages = ['en', 'nl', 'da', 'de', 'es', 'fr', 'it', 'no', 'sv', 'pl', 'ru', 'ko', 'ar'];
		assert.deepStrictEqual(locales.map(file => path.basename(file, '.json')).sort(), languages.slice().sort());
		const sharedWords = {
			nl: 'style_status style_scheme_amber style_design_dashboard style_design_focus style_element style_compact style_widget style_color_indigo',
			da: 'style_status style_element style_design style_design_style style_design_styles style_normal style_widget style_color_orange style_color_cyan style_color_indigo',
			de: 'style_name style_status style_element style_direction_horizontal style_design style_design_style style_design_styles style_normal style_widget style_color_orange style_color_cyan style_color_indigo',
			es: 'style_design_vertical style_direction_horizontal style_direction_vertical style_normal style_color style_widget',
			fr: 'style_select style_design_vertical style_direction_horizontal style_direction_vertical style_progress_direction style_design style_design_style style_design_styles style_compact style_normal style_widget style_color_orange style_color_cyan style_color_indigo',
			it: 'style_design style_design_style style_widget',
			no: 'style_status style_element style_design style_design_style style_normal style_widget style_color_cyan style_color_indigo',
			sv: 'style_status style_element style_design style_design_style style_normal style_widget style_color_orange style_color_cyan style_color_indigo',
			pl: 'style_scheme_ocean style_element style_background_gradient',
			ru: '',
			ko: '',
			ar: ''
		};
		const reference = JSON.parse(fs.readFileSync(path.join(sourceDir, 'en.json'), 'utf8'));
		const referenceSettings = JSON.parse(fs.readFileSync(path.join(sourceDir, 'en.settings.json'), 'utf8'));
		const changelog = JSON.parse(fs.readFileSync(path.join(root, '.homeychangelog.json'), 'utf8'));
		const version = require('../.homeycompose/app.json').version;
		assert.strictEqual(version, require('../app.json').version);
		assert.strictEqual(version, require('../package.json').version);
		assert.strictEqual(version, require('../package-lock.json').version);
		assert.ok(Object.keys(referenceSettings).length > 0);
		for (const file of locales) {
			const language = path.basename(file, '.json');
			const source = JSON.parse(fs.readFileSync(path.join(sourceDir, file), 'utf8'));
			const settings = JSON.parse(fs.readFileSync(path.join(sourceDir, `${language}.settings.json`), 'utf8'));
			const placeholder = JSON.parse(fs.readFileSync(path.join(root, 'locales', file), 'utf8'));
			assert.ok(source.invalid_millisecond_duration.includes('50'), `${language}: millisecond error`);
			assert.strictEqual(require('../.homeycompose/app.json').name[language], 'Chronograph', `${language}: app name`);
			assert.ok(source.name_based_api_notice.includes('Chronograph'), `${language}: API notice brand`);
			assert.ok(settings.settings_navigation.includes('Chronograph'), `${language}: settings navigation brand`);
			const readme = language === 'en' ? 'README.txt' : `README.${language}.txt`;
			assert.ok(fs.readFileSync(path.join(root, readme), 'utf8').includes('Chronograph'), `${language}: app store description brand`);
			assert.ok(!/[?\uFFFD]/.test(source.name_based_api_notice), `${language}: API notice`);
			assert.ok(!/[?\uFFFD]/.test(settings.widget_icon_none), `${language}: widget icon label`);
			assert.ok(typeof changelog[version][language] === 'string' && changelog[version][language].trim(), `${language}: current changelog`);
			assert.strictEqual(changelog['3.0.0'][language].split('\n').pop(), source.name_based_api_notice, language);
			assert.ok(!changelog['2.3.1'][language].includes(source.name_based_api_notice), language);
			assert.ok(!Object.prototype.hasOwnProperty.call(source, 'settings'), language);
			assert.deepStrictEqual(Object.keys(source).sort(), Object.keys(reference).sort(), language);
			assert.deepStrictEqual(Object.keys(settings).sort(), Object.keys(referenceSettings).sort(), language);
			for (const [actual, expected] of [[source, reference], [settings, referenceSettings]]) {
				for (const key of Object.keys(expected)) {
					assert.ok(typeof actual[key] === 'string' && actual[key].trim(), `${language}: ${key}`);
					const placeholders = value => (value.match(/__[a-zA-Z0-9_]+__/g) || []).sort();
					assert.deepStrictEqual(placeholders(actual[key]), placeholders(expected[key]), `${language}: ${key}`);
				}
				if (language !== 'en') {
					for (const [key, text] of Object.entries(referenceSettings)) {
						if (key.startsWith('style_') && !['style_design_widgetkeeper', 'style_color_hex'].includes(key) && !sharedWords[language].split(' ').includes(key)) {
							assert.notStrictEqual(settings[key], text, `${language}: ${key}`);
						}
					}
				}
			}
			assert.ok(placeholder && typeof placeholder === 'object' && !Array.isArray(placeholder), language);
		}
	});
});
