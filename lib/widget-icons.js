'use strict';

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const styles = { fas: 'Solid', far: 'Regular', fab: 'Brands' };
const styleOrder = { far: 0, fas: 1, fab: 2 };
const defaultNames = {
	'fas:hourglass-half': 'Timer',
	'fas:stopwatch': 'Stopwatch',
	'chronograph:transition': 'Transition'
};
const preferredIds = ['fas:stopwatch', 'fas:hourglass-half', 'chronograph:transition'];
let iconData;

function loadIconData() {
	if (iconData) return iconData;
	const catalog = JSON.parse(zlib.gunzipSync(
		fs.readFileSync(path.join(__dirname, '..', 'assets', 'fontawesome-icons.json.gz'))
	).toString('utf8'));
	const previews = JSON.parse(zlib.gunzipSync(
		fs.readFileSync(path.join(__dirname, '..', 'assets', 'fontawesome-previews.json.gz'))
	).toString('utf8'));
	const icons = catalog.map(([style, name, width, height, paths, aliases]) => ({
		id: style + ':' + name,
		name,
		style,
		width,
		height,
		paths: Array.isArray(paths) ? paths : [paths],
		aliases
	})).sort((a, b) => styleOrder[a.style] - styleOrder[b.style] || a.name.localeCompare(b.name));
	const transitionPreview = fs.readFileSync(path.join(__dirname, '..', 'assets', 'transition-solid-preview.png'));
	const transition = {
		id: 'chronograph:transition', name: 'transition', style: 'app',
		aliases: ['transitie', 'gauge', 'speedometer'],
		image: 'data:image/png;base64,' + transitionPreview.toString('base64')
	};
	const preferred = preferredIds.map(id => {
		if (id === transition.id) return transition;
		const icon = icons.find(item => item.id === id);
		if (!icon) throw new Error('Missing default Font Awesome icon: ' + id);
		return icon;
	});
	iconData = { icons, preferred, previews };
	return iconData;
}

function toResult(icon, previews, includeImages) {
	const result = {
		id: icon.id,
		name: defaultNames[icon.id] || icon.name.replace(/-/g, ' '),
		description: preferredIds.includes(icon.id) ? 'App' : styles[icon.style]
	};
	if (includeImages) {
		if (!icon.image && !previews[icon.id]) throw new Error('Missing Font Awesome preview: ' + icon.id);
		result.image = icon.image || 'data:image/png;base64,' + previews[icon.id];
	}
	return result;
}

function searchIcons(query, noneLabel, options = {}) {
	const { icons, preferred, previews } = loadIconData();
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
	const includeImages = options.includeImages !== false;
	results.push(...preferred.filter(matches).map(icon => toResult(icon, previews, includeImages)));
	for (const icon of icons) {
		if (!preferredIds.includes(icon.id) && matches(icon)) results.push(toResult(icon, previews, includeImages));
	}
	return results;
}

module.exports = { searchIcons };
