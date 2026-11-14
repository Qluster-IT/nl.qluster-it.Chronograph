'use strict';

const { promisify } = require('util');
const zlib = require('zlib');

const gzip = promisify(zlib.gzip);
const gunzip = promisify(zlib.gunzip);
const maxEncodedLength = 128 * 1024;
const maxJsonLength = 512 * 1024;
const alphabet = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const keys = [
	'name', 'layouts', 'groups', 'elements', 'overrides', 'row', 'group', 'order',
	'compact', 'normal', 'large', 'inactive', 'running', 'paused', 'starting',
	'icon', 'status', 'duration', 'play', 'pause', 'stop', 'fields', 'cancel', 'start', 'progress',
	'colors', 'colorOverrides', 'foregroundColors', 'foregroundOverrides', 'borderColors', 'borderOverrides',
	'progressColors', 'progressSettings', 'background', 'foreground',
	'rowVisibility', 'rowColumns', 'columnSpans', 'columnAlignments', 'columnVerticalAlignments',
	'columnDirections', 'columnWidths', 'columnRowSpans', 'rowAlignments', 'rowTopPadding', 'rowCounts',
	'elementSizes', 'base', 'buttonTexts', 'buttonShapes', 'reservedElements', 'inputFieldRows',
	'timer', 'transition', 'states', 'startForm', 'hideAfter', 'seconds',
	'heightModes', 'startFieldsVisibility', 'buttonVisibility', 'buttonRules',
	'allowShrink', 'direction', 'mode', 'visible', 'width', 'height'
];
const keyToCode = new Map(keys.map((key, index) => [key, alphabet[Math.floor(index / alphabet.length)] + alphabet[index % alphabet.length]]));
const codeToKey = new Map(Array.from(keyToCode, ([key, code]) => [code, key]));
const forbiddenKeys = new Set(['__proto__', 'constructor', 'prototype']);

function transform(value, encode) {
	if (Array.isArray(value)) return value.map(item => transform(item, encode));
	if (!value || typeof value !== 'object') return value;
	const result = Object.create(null);
	for (const [key, child] of Object.entries(value)) {
		let next;
		if (encode) next = keyToCode.get(key) || '~' + key;
		else if (key.startsWith('~')) next = key.slice(1);
		else next = codeToKey.get(key);
		if (!next || forbiddenKeys.has(next) || Object.prototype.hasOwnProperty.call(result, next)) {
			throw new Error('Invalid template property');
		}
		result[next] = transform(child, encode);
	}
	return result;
}

function types(data) {
	return [data.design && 'DESIGN', data.theme && 'THEME'].filter(Boolean).join(',');
}

function withoutId(item) {
	if (!item || typeof item !== 'object' || Array.isArray(item)) throw new Error('Invalid template item');
	const copy = { ...item };
	delete copy.id;
	return copy;
}

async function encodeTemplate(data) {
	if (!data || (!data.design && !data.theme)) throw new Error('Select a design or theme');
	const body = { v: 1 };
	if (data.design) body.d = transform(withoutId(data.design), true);
	if (data.theme) body.t = transform(withoutId(data.theme), true);
	const json = JSON.stringify(body);
	if (Buffer.byteLength(json) > maxJsonLength) throw new Error('Template is too large');
	const encoded = (await gzip(json, { level: 9 })).toString('base64');
	if (encoded.length > maxEncodedLength) throw new Error('Template is too large');
	return `[twf:Chronograph:${types(data)}:"${encoded}":/twf]`;
}

async function decodeTemplate(text) {
	if (typeof text !== 'string' || text.length > maxEncodedLength + 100) throw new Error('Invalid template');
	const match = /^\[twf:Chronograph:(DESIGN|THEME|DESIGN,THEME):"(H4s[A-Za-z0-9+/]*={0,2})":\/twf\]$/.exec(text.trim());
	if (!match) throw new Error('Invalid template');
	const compressed = Buffer.from(match[2], 'base64');
	if (compressed.toString('base64') !== match[2]) throw new Error('Invalid template encoding');
	const json = await gunzip(compressed, { maxOutputLength: maxJsonLength });
	const body = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(json));
	if (!body || body.v !== 1 || Object.keys(body).some(key => !['v', 'd', 't'].includes(key))) {
		throw new Error('Unsupported template version');
	}
	const result = {};
	if (body.d) result.design = transform(body.d, false);
	if (body.t) result.theme = transform(body.t, false);
	if (types(result) !== match[1]) throw new Error('Template contents do not match its header');
	return result;
}

module.exports = { encodeTemplate, decodeTemplate };
