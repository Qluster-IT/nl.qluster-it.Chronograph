FUNKTIONER

* Självförklarande flödeskort för enkel integrering av timers, stoppur och övergångar i din hemautomation,
* Skapa timers, stoppur och övergångar direkt från flödeskort, ingen förkonfiguration behövs,
* Starta timers med en varaktighet i millisekunder (bråkdels sekunder), sekunder, minuter, timmar eller dagar,
* Starta stoppur utan en förutbestämd sluttid,
* Starta övergångar för att gradvis ändra en enhetsparameter över tid,
* Utlösa flöden vid exakta timer- eller stopptider med millisekund (bråkdels sekunder) precision,
* Pausa och återuppta timers, stoppur och övergångar med åtgärdskort eller från inställningar,
* Stöd för slumpmässiga eller beräknade varaktigheter eller justeringar med hjälp av enkla matematiska uttryck,
* Alla timers, stoppur och övergångar är beständiga över Homey omstarter,
* Rikta flera timers, stoppur och övergångar samtidigt med jokertecken i stödda kort.

ENKLA MATEMATISKA UTTRYCK

Starta, återuppta och justera åtgärdskort har inbyggt stöd för enkla matematiska uttryck. Detta möjliggör slumpmässiga eller beräknade timer- och stoppursvaraktigheter, inklusive beräkningar baserade på tokenvärden.

Till exempel:

	ceil(99.5) / 5
	pick(1, 3, 5, 9) * 2
	random(10, 30)
	abs(-10)

Förutom grundläggande matematiska uttryck stöds följande funktioner:

* abs(x) - beräkna det absoluta värdet av ett tal,
* ceil(x) - avrundar ett tal upp till närmaste heltal,
* floor(x) - avrundar ett tal ner till närmaste heltal,
* round(x) - avrundar ett tal mot närmaste heltal,
* random(min, max) - ett slumpmässigt tal större eller lika med min och mindre än max,
* min(x, y) - det lägsta talet från den angivna listan,
* max(x, y) - det största talet från den angivna listan,
* pick(x, y[, n]) - välj ett slumpmässigt värde från den angivna listan.

HOMEYSCRIPT

Förutom de tillgängliga flödeskorten kan timers och stoppur även styras med [HomeyScript](https://homeyscript.homey.app).

Till exempel, detta skript stoppar alla aktiva timers:

	let app = await Homey.apps.getApp({id:'nl.fellownet.chronograph'});
	app.apiGet('/timers').then(result => {
		let timers = JSON.parse(result);
		timers.forEach(timer => {
			app.apiDelete('/timers/' + timer.id);
		});
	});

* GET /timers - hämta en lista över alla aktiva timers,
* GET /timers/:id - hämta en enskild timer,
* PUT /timers/:id - pausa eller återuppta en timer,
* DELETE /timers/:id - stoppar en timer.
* GET /stopwatches - hämta en lista över alla aktiva timers,
* GET /stopwatches/:id - hämta en enskild timer,
* PUT /stopwatches/:id - pausa eller återuppta en timer,
* DELETE /stopwatches/:id - stoppar en timer.
* GET /transitions - hämta en lista över alla aktiva övergångar,
* GET /transitions/:id - hämta en enskild övergång,
* PUT /transitions/:id - pausa eller återuppta en övergång,
* DELETE /transitions/:id - stoppar en övergång.