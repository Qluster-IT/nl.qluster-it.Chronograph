'use strict';

const fs = require('fs');
const path = require('path');

// Homey copies production dependencies separately, bypassing .homeyignore.
function pruneDependencies(appPath) {
	const directory = path.join(appPath, 'node_modules', 'betterlogiclibrary');
	const manifest = JSON.parse(fs.readFileSync(path.join(directory, 'package.json'), 'utf8'));
	const protectedFiles = new Set([path.resolve(directory, manifest.main || 'index.js')]);
	function protect(value) {
		if (typeof value === 'string') protectedFiles.add(path.resolve(directory, value));
		else if (value && typeof value === 'object') Object.values(value).forEach(protect);
	}
	protect(manifest.exports);
	const stats = { files: 0, bytes: 0 };
	function visit(folder, nonRuntime) {
		for (const entry of fs.readdirSync(folder, { withFileTypes: true })) {
			const target = path.join(folder, entry.name);
			if (entry.isSymbolicLink() || entry.name === 'node_modules') continue;
			const removable = nonRuntime || folder === directory && ['test', '.github'].includes(entry.name);
			if (entry.isDirectory()) {
				visit(target, removable);
				if (fs.readdirSync(target).length === 0) fs.rmdirSync(target);
			} else if (entry.isFile() && !protectedFiles.has(target) && !/^licen[cs]e/i.test(entry.name)
				&& (removable || /(?:\.d\.[cm]?ts|\.map|\.md|\.markdown)$/i.test(entry.name))) {
				stats.bytes += fs.statSync(target).size;
				fs.unlinkSync(target);
				stats.files++;
			}
		}
	}
	visit(directory, false);
	return stats;
}

if (require.main === module) {
	const stats = pruneDependencies(path.resolve(__dirname, '..'));
	console.log(`Pruned ${stats.files} non-runtime BLL files (${stats.bytes} bytes).`);
}

module.exports = { pruneDependencies };
