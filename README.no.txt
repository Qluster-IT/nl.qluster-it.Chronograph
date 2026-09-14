FUNKSJONER

* Selvforklarende flytkort for enkel integrering av tidtakere, stoppklokker og overganger i din hjemmeautomatisering,
* Opprett tidtakere, stoppklokker og overganger direkte fra flytkortene, ingen behov for en forhåndskonfigurasjon,
* Start tidtakere med en varighet i millisekunder (brøksekunder), sekunder, minutter, timer eller dager,
* Start stoppklokker uten en forhåndsdefinert sluttid,
* Start overganger for gradvis å endre en enhetsparameter over tid,
* Utløser flyter på eksakte tidtaker- eller stoppklokkevarigheter med millisekund (brøksekunder) presisjon,
* Pause og gjenoppta tidtakere, stoppklokker og overganger med handlingskort eller fra innstillinger,
* Støtte for tilfeldige eller beregnede varigheter eller justeringer ved bruk av enkle matematiske uttrykk,
* Alle tidtakere, stoppklokker og overganger er vedvarende over Homey-omstarter,
* Målrett flere tidtakere, stoppklokker og overganger på en gang ved hjelp av jokertegn i støttede kort.

ENKLE MATEMATISKE UTTRYKK

Start-, gjenoppta- og justeringshandlingskortene har innebygd støtte for enkle matematiske uttrykk. Dette tillater tilfeldige eller beregnede tidtaker- og stoppklokkevarigheter, inkludert beregninger basert på tokenverdier.

For eksempel:

	ceil(99.5) / 5
	pick(1, 3, 5, 9) * 2
	random(10, 30)
	abs(-10)

I tillegg til grunnleggende matematiske uttrykk støttes følgende funksjoner:

* abs(x) - beregn den absolutte verdien av et tall,
* ceil(x) - avrunder et tall oppover til neste hele tall,
* floor(x) - avrunder et tall nedover til forrige hele tall,
* round(x) - avrunder et tall til nærmeste hele tall,
* random(min, max) - et tilfeldig tall større eller lik min og mindre enn maks,
* min(x, y) - det laveste tallet fra den leverte listen,
* max(x, y) - det største tallet fra den leverte listen,
* pick(x, y[, n]) - velg en tilfeldig verdi fra den leverte listen.

HOMEYSCRIPT

I tillegg til de tilgjengelige flytkortene kan tidtakere og stoppklokker også kontrolleres ved bruk av [HomeyScript](https://homeyscript.homey.app).

For eksempel, dette skriptet vil stoppe alle aktive tidtakere:

	let app = await Homey.apps.getApp({id:'nl.fellownet.chronograph'});
	app.apiGet('/timers').then(result => {
		let timers = JSON.parse(result);
		timers.forEach(timer => {
			app.apiDelete('/timers/' + timer.id);
		});
	});

* GET /timers - hente en liste over alle aktive tidtakere,
* GET /timers/:id - hente en individuell tidtaker,
* PUT /timers/:id - pause eller gjenoppta en tidtaker,
* DELETE /timers/:id - stopper en tidtaker.
* GET /stopwatches - hente en liste over alle aktive stoppeklokker,
* GET /stopwatches/:id - hente en individuell stoppeklokke,
* PUT /stopwatches/:id - pause eller gjenoppta en stoppeklokke,
* DELETE /stopwatches/:id - stopper en stoppeklokke.
* GET /transitions - hente en liste over alle aktive overganger,
* GET /transitions/:id - hente en individuell overgang,
* PUT /transitions/:id - pause eller gjenoppta en overgang,
* DELETE /transitions/:id - stopper en overgang.