FUNKTIONER

* Selvforklarende flow-kort for nem integration af timere, stopure og overgange i din hjemmeautomatisering,
* Opret timere, stopure og overgange direkte fra flow-kort, ingen forudgående konfiguration nødvendig,
* Start timere med en varighed i millisekunder (fraktioner af sekunder), sekunder, minutter, timer eller dage,
* Start stopure uden en foruddefineret slutningstid,
* Start overgange for gradvist at ændre en enhedsparameter over tid,
* Udløs flows ved præcise timer- eller stopursvarigheder med præcision i millisekunder (fraktioner af sekunder),
* Pause og genoptag timere, stopure og overgange med handlingskort eller fra indstillingerne,
* Understøttelse af tilfældige eller beregnede varigheder eller justeringer ved hjælp af simple matematiske udtryk,
* Alle timere, stopure og overgange er vedvarende på tværs af Homey genstarter,
* Målret flere timere, stopure og overgange på én gang ved at bruge wildcard i understøttede kort.

ENKLE MATEMATISKE UDTRYK

Start-, genoptagelses- og justeringskortene har indbygget understøttelse af simple matematiske udtryk. Dette giver mulighed for tilfældige eller beregnede timer- og stopursvarigheder inklusive beregninger baseret på token-værdier.

For eksempel:

	ceil(99.5) / 5
	pick(1, 3, 5, 9) * 2
	random(10, 30)
	abs(-10)

Ud over basale matematiske udtryk understøttes følgende funktioner:

* abs(x) - beregn den absolutte værdi af et tal,
* ceil(x) - runder et tal op til næste hele tal,
* floor(x) - runder et tal ned til tidligere hele tal,
* round(x) - runder et tal til nærmeste hele tal,
* random(min, max) - et tilfældigt tal større end eller lig med min og mindre end max,
* min(x, y) - det laveste tal fra den angivne liste,
* max(x, y) - det største tal fra den angivne liste,
* pick(x, y[, n]) - vælg en tilfældig værdi fra den angivne liste.

HOMEYSCRIPT

Ud over de tilgængelige flow-kort kan timere og stopure også styres ved hjælp af [HomeyScript](https://homeyscript.homey.app).

For eksempel vil dette script stoppe alle kørende timere:

	let app = await Homey.apps.getApp({id:'nl.fellownet.chronograph'});
	app.apiGet('/timers').then(result => {
		let timers = JSON.parse(result);
		timers.forEach(timer => {
			app.apiDelete('/timers/' + timer.id);
		});
	});

* GET /timers - hent en liste over alle aktive timere,
* GET /timers/:id - hent en enkelt timer,
* PUT /timers/:id - pause eller genoptag en timer,
* DELETE /timers/:id - stopper en timer.
* GET /stopwatches - hent en liste over alle aktive stopure,
* GET /stopwatches/:id - hent et enkelt stopur,
* PUT /stopwatches/:id - pause eller genoptag et stopur,
* DELETE /stopwatches/:id - stopper et stopur.
* GET /transitions - hent en liste over alle aktive overgange,
* GET /transitions/:id - hent en enkelt overgang,
* PUT /transitions/:id - pause eller genoptag en overgang,
* DELETE /transitions/:id - stopper en overgang.