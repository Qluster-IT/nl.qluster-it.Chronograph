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
* Med Chronograph-dashbordwidgeten kan du velge en tidtaker, stoppeklokke eller overgang i widgetinnstillingene og pause, gjenoppta eller stoppe den.
* Bruk matematiske uttrykk inne i flytkort.
* Bruk HomeyScript til å overvåke, pause, fortsette eller stoppe aktive tidtakere, stoppeklokker og overganger.

Start-, fortsett-, og justeringshandlingskort har innebygd støtte for enkle matematiske uttrykk. Dette tillater tilfeldige eller beregnede tidtaker- og stoppeklokkevarigheter, inkludert beregninger basert på tokenverdier.
For eksempel:

	ceil(99.5) / 5
	pick(1, 3, 5, 9) * 2
	random(10, 30)
	abs(-10)

I tillegg til de tilgjengelige flytkortene, kan tidtakere og stoppeklokker også kontrolleres ved bruk av HomeyScript.

For eksempel vil dette skriptet stoppe alle løpende tidtakere:

	const app = await Homey.apps.getApp({ id: 'nl.fellownet.chronograph' });
	const timers = await app.get({ path: '/timers/' });
	for (const timer of timers) {
		if (timer.running) {
			await app.delete({ path: '/timers/' + encodeURIComponent(timer.name) });
		}
	}

Se emnet på samfunnsforumet for mer informasjon!
For Chronograph-wikien med brukerveiledning og API-referanse, velg "Besøk nettsted" under "Utviklerens nettsted" på denne appens side i Homey App Store.