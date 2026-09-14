FUNCTIES

* Gebruiksvriendelijke flowkaarten voor eenvoudige integratie van timers, stopwatches en overgangen in je huisautomatisering,
* Creëer timers, stopwatches en overgangen direct vanuit flowkaarten, geen voorafgaande configuratie nodig,
* Start timers met een duur in milliseconden (gedeeltelijke seconden), seconden, minuten, uren of dagen,
* Start stopwatches zonder een vooraf gedefinieerde eindtijd,
* Start overgangen om geleidelijk een apparaatparameter over tijd te veranderen,
* Trigger flows op exacte timer- of stopwatchtijden met milliseconde (gedeeltelijke seconden) precisie,
* Pauzeer en hervat timers, stopwatches en overgangen met actiekaarten of vanuit instellingen,
* Ondersteuning voor willekeurige of berekende duren of aanpassingen met behulp van eenvoudige wiskundige expressies,
* Alle timers, stopwatches en overgangen zijn persistent bij herstart van Homey,
* Richt je op meerdere timers, stopwatches en overgangen tegelijk met behulp van wildcards in ondersteunde kaarten.

EENVOUDIGE WISKUNDIGE EXPRESSIES

De start-, hervat- en aanpassingsactiekaarten hebben ingebouwde ondersteuning voor eenvoudige wiskundige expressies. Dit maakt het mogelijk om willekeurige of berekende tijdsduur voor timers en stopwatches te gebruiken, inclusief berekeningen op basis van tokenwaarden.

Bijvoorbeeld:

	ceil(99.5) / 5
	pick(1, 3, 5, 9) * 2
	random(10, 30)
	abs(-10)

Naast basis wiskundige expressies worden de volgende functies ondersteund:

* abs(x) - bereken de absolute waarde van een getal,
* ceil(x) - rondt een getal naar boven af naar het volgende gehele getal,
* floor(x) - rondt een getal naar beneden af naar het vorige gehele getal,
* round(x) - rondt een getal af naar het dichtstbijzijnde gehele getal,
* random(min, max) - een willekeurig getal groter of gelijk aan min en kleiner dan max,
* min(x, y) - het laagste getal uit de opgegeven lijst,
* max(x, y) - het grootste getal uit de opgegeven lijst,
* pick(x, y[, n]) - kies een willekeurige waarde uit de opgegeven lijst.

HOMEYSCRIPT

Bovendien kunnen timers en stopwatches naast de beschikbare flowkaarten ook worden beheerd met behulp van [HomeyScript](https://homeyscript.homey.app).

Bijvoorbeeld, dit script stopt alle actieve timers:

	let app = await Homey.apps.getApp({id:'nl.fellownet.chronograph'});
	app.apiGet('/timers').then(result => {
		let timers = JSON.parse(result);
		timers.forEach(timer => {
			app.apiDelete('/timers/' + timer.id);
		});
	});

* GET /timers - haal een lijst op van alle actieve timers,
* GET /timers/:id - haal een enkele timer op,
* PUT /timers/:id - pauzeer of hervat een timer,
* DELETE /timers/:id - stopt een timer.
* GET /stopwatches - haal een lijst op van alle actieve timers,
* GET /stopwatches/:id - haal een enkele timer op,
* PUT /stopwatches/:id - pauzeer of hervat een timer,
* DELETE /stopwatches/:id - stopt een timer.
* GET /transitions - haal een lijst op van alle actieve overgangen,
* GET /transitions/:id - haal een enkele overgang op,
* PUT /transitions/:id - pauzeer of hervat een overgang,
* DELETE /transitions/:id - stopt een overgang.