FUNKSJONER

* Selvforklarende flytkort for enkel integrasjon av tidtakere, stoppeklokker og overganger i hjemmeautomatiseringen din.
* Opprett tidtakere, stoppeklokker og overganger direkte fra flytkort, ingen behov for forhåndskonfigurasjon.
* Start tidtakere med en varighet i millisekunder (brøkdels sekunder), sekunder, minutter, timer eller dager.
* Start stoppeklokker uten en forhåndsdefinert sluttid.
* Start overganger for å gradvis endre en enhetsparameter over tid.
* Utløs flyter ved eksakte tidtaker- eller stoppeklokkavarigheter med millisekunders nøyaktighet.
* Pause og gjenoppta tidtakere, stoppeklokker og overganger med handlingskort eller fra innstillinger.
* Støtte for tilfeldige eller beregnede varigheter eller justeringer ved hjelp av enkle matematiske uttrykk.
* Alle tidtakere, stoppeklokker og overganger er vedvarende på tvers av Homey omstarter.
* Rett flere tidtakere, stoppeklokker og overganger samtidig ved å bruke jokertegn i støttede kort.
* Bruk matematiske uttrykk inne i flytkort.
* Bruk HomeyScript for å utløse eller sette tidtakere, stoppeklokker og overganger.

Start-, fortsett-, og justeringshandlingskort har innebygd støtte for enkle matematiske uttrykk. Dette tillater tilfeldige eller beregnede tidtaker- og stoppeklokkevarigheter, inkludert beregninger basert på tokenverdier.
For eksempel:

	ceil(99.5) / 5
	pick(1, 3, 5, 9) * 2
	random(10, 30)
	abs(-10)

I tillegg til de tilgjengelige flytkortene, kan tidtakere og stoppeklokker også kontrolleres ved bruk av [HomeyScript](https://homeyscript.homey.app).

For eksempel vil dette skriptet stoppe alle løpende tidtakere:

	let app = await Homey.apps.getApp({id:'nl.fellownet.chronograph'});
	app.apiGet('/timers').then(result => {
		let timers = JSON.parse(result);
		timers.forEach(timer => {
			app.apiDelete('/timers/' + timer.id);
		});
	});

Se emnet på samfunnsforumet for mer informasjon!