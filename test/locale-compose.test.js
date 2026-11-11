'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

describe('Homey Compose locales', () => {
	it('provides all base and settings translations in the Compose sources', () => {
		const root = path.join(__dirname, '..');
		const sourceDir = path.join(root, '.homeycompose', 'locales');
		const locales = fs.readdirSync(sourceDir).filter(file => /^[a-z]+\.json$/.test(file));
		const reference = JSON.parse(fs.readFileSync(path.join(sourceDir, 'en.json'), 'utf8'));
		const referenceSettings = JSON.parse(fs.readFileSync(path.join(sourceDir, 'en.settings.json'), 'utf8'));
		assert.ok(Object.keys(referenceSettings).length > 0);
		for (const file of locales) {
			const language = path.basename(file, '.json');
			const source = JSON.parse(fs.readFileSync(path.join(sourceDir, file), 'utf8'));
			const settings = JSON.parse(fs.readFileSync(path.join(sourceDir, `${language}.settings.json`), 'utf8'));
			const placeholder = JSON.parse(fs.readFileSync(path.join(root, 'locales', file), 'utf8'));
			assert.ok(!Object.prototype.hasOwnProperty.call(source, 'settings'), language);
			assert.deepStrictEqual(Object.keys(source).sort(), Object.keys(reference).sort(), language);
			assert.deepStrictEqual(Object.keys(settings).sort(), Object.keys(referenceSettings).sort(), language);
			for (const [actual, expected] of [[source, reference], [settings, referenceSettings]]) {
				for (const key of Object.keys(expected)) {
					assert.ok(typeof actual[key] === 'string' && actual[key].trim(), `${language}: ${key}`);
					const placeholders = value => (value.match(/__[a-zA-Z0-9_]+__/g) || []).sort();
					assert.deepStrictEqual(placeholders(actual[key]), placeholders(expected[key]), `${language}: ${key}`);
				}
			}
			if (Object.keys(placeholder).length) {
				assert.deepStrictEqual(placeholder, { ...source, settings }, language);
			} else {
				assert.deepStrictEqual(placeholder, {}, language);
			}
		}
	});
});
