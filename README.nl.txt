FUNCTIES

* Zelfverklarende flowkaarten voor eenvoudige integratie van timers, stopwatches en transities in je huisautomatisering.
* Creëer timers, stopwatches en transities direct vanuit flowkaarten, zonder dat een voorafgaande configuratie nodig is.
* Start timers met een duur in milliseconden (fractieseconden), seconden, minuten, uren of dagen.
* Start stopwatches zonder een vooraf bepaalde eindtijd.
* Start transities om geleidelijk een apparaatparameter in de loop van de tijd te veranderen.
* Laat flows exact triggeren op timer- of stopwatchduur met milliseconde (fractieseconden) precisie.
* Pauzeer en hervat timers, stopwatches en transities met actiekaarten of vanuit de instellingen.
* Ondersteuning voor willekeurige of berekende duur of aanpassingen met behulp van eenvoudige wiskundige uitdrukkingen.
* Alle timers, stopwatches en transities blijven behouden bij Homey-herstarts.
* Richt op meerdere timers, stopwatches en transities tegelijk met gebruik van wildcards in ondersteunde kaarten.
* Met de Chronograph-dashboardwidget kun je in de widgetinstellingen een timer, stopwatch of transitie selecteren en deze pauzeren, hervatten of stoppen.
* Gebruik wiskundige uitdrukkingen binnen flowkaarten.
* Gebruik HomeyScript om actieve timers, stopwatches en transities te bekijken, pauzeren, hervatten of stoppen.

De start-, hervat- en aanpasactiekaarten hebben ingebouwde ondersteuning voor eenvoudige wiskundige uitdrukkingen. Dit maakt het mogelijk om willekeurige of berekende timer- en stopwatchduren te gebruiken, inclusief berekeningen op basis van tokenwaarden.
Bijvoorbeeld:

	ceil(99.5) / 5
	pick(1, 3, 5, 9) * 2
	random(10, 30)
	abs(-10)

Naast de beschikbare flowkaarten kunnen timers en stopwatches ook worden bediend met behulp van [HomeyScript](https://homeyscript.homey.app).

Bijvoorbeeld, dit script stopt alle lopende timers:

	const app = await Homey.apps.getApp({ id: 'nl.fellownet.chronograph' });
	const timers = await app.get({ path: '/timers/' });
	for (const timer of timers) {
		if (timer.running) {
			await app.delete({ path: '/timers/' + encodeURIComponent(timer.id) });
		}
	}

Bekijk het topic op het Community Forum voor meer informatie!