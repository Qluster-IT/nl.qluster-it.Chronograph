'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..', '..');
const javascript = [
	'assets/js/angular.min.js',
	'assets/js/chronograph-widget-style.js',
	'assets/js/chronograph-errors.js',
	'assets/js/chronograph-widget.js',
	'assets/js/multiple-chronographs-widget.js'
];
const stylesheets = [
	'assets/css/fontawesome.min.css',
	'assets/css/solid.min.css',
	'assets/css/regular.min.css',
	'assets/css/brands.min.css',
	'assets/css/chronograph-widget.css',
	'assets/css/multiple-chronographs-widget.css'
];
const template = 'assets/templates/chronograph-widget-design.html';

function read(file) {
	return fs.readFileSync(path.join(root, ...file.split('/')), 'utf8').replace(/\r\n/g, '\n');
}

function build() {
	const scripts = javascript.map(file => {
		const source = read(file);
		return file === 'assets/js/angular.min.js'
			? source.replace(/^\/\/# sourceMappingURL=.*\r?\n?/m, '')
			: source;
	});
	scripts.push("angular.module('chronographWidget').run(['$templateCache', function ($templateCache) {\n"
		+ "\t$templateCache.put('../../assets/templates/chronograph-widget-design.html', " + JSON.stringify(read(template)) + ");\n"
		+ '}]);');
	return {
		'assets/js/widget-bundle.js': scripts.join('\n;\n') + '\n',
		'assets/css/widget-bundle.css': stylesheets.map(read).join('\n') + '\n'
	};
}

if (require.main === module) {
	for (const [file, content] of Object.entries(build())) {
		fs.writeFileSync(path.join(root, ...file.split('/')), content, 'utf8');
		console.log('Built ' + file);
	}
}

module.exports = build;
