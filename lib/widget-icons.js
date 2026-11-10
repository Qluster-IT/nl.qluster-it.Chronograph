'use strict';

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const catalog = JSON.parse(zlib.gunzipSync(
	fs.readFileSync(path.join(__dirname, '..', 'assets', 'fontawesome-icons.json.gz'))
).toString('utf8'));
const previews = JSON.parse(zlib.gunzipSync(
	fs.readFileSync(path.join(__dirname, '..', 'assets', 'fontawesome-previews.json.gz'))
).toString('utf8'));

const styles = { fas: 'Solid', far: 'Regular', fab: 'Brands' };
const styleOrder = { far: 0, fas: 1, fab: 2 };
const defaultNames = {
	'fas:clock': 'Timer (clock)',
	'fas:stopwatch': 'Stopwatch',
	'fas:shuffle': 'Transition (shuffle)'
};
const icons = catalog.map(([style, name, width, height, paths, aliases]) => ({
	id: style + ':' + name,
	name,
	style,
	width,
	height,
	paths: Array.isArray(paths) ? paths : [paths],
	aliases
})).sort((a, b) => styleOrder[a.style] - styleOrder[b.style] || a.name.localeCompare(b.name));

const preferredIds = ['fas:stopwatch', 'fas:clock', 'fas:shuffle'];
const preferred = preferredIds.map(id => {
	const icon = icons.find(item => item.id === id);
	if (!icon) throw new Error('Missing default Font Awesome icon: ' + id);
	return icon;
});

function toResult(icon) {
	if (!previews[icon.id]) throw new Error('Missing Font Awesome preview: ' + icon.id);
	return {
		id: icon.id,
		name: defaultNames[icon.id] || icon.name.replace(/-/g, ' '),
		description: styles[icon.style],
		image: 'data:image/png;base64,' + previews[icon.id]
	};
}

function searchIcons(query, noneLabel) {
	const words = (query || '').trim().toLowerCase().split(/\s+/).filter(Boolean);
	const styleNames = { solid: 'fas', regular: 'far', brand: 'fab', brands: 'fab' };
	const styleWords = words.filter(word => styleNames[word]);
	const search = words.filter(word => !styleNames[word]).join('-');
	const matches = icon => (!styleWords.length || styleWords.every(word => styleNames[word] === icon.style))
		&& (icon.name.includes(search)
		|| (defaultNames[icon.id] && defaultNames[icon.id].toLowerCase().includes(search))
		|| icon.aliases.some(alias => alias.includes(search)));
	const results = [];
	if (!styleWords.length && (!search || noneLabel.toLowerCase().includes(search) || 'none'.includes(search))) {
		results.push({ id: 'none', name: noneLabel });
	}
	results.push(...preferred.filter(matches).map(toResult));
	for (const icon of icons) {
		if (!preferredIds.includes(icon.id) && matches(icon)) results.push(toResult(icon));
	}
	return results;
}

module.exports = { searchIcons };
