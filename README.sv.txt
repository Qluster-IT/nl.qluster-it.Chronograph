FUNKTIONER

* Självförklarande flödeskort för enkel integration av timers, stoppur och övergångar i din hemautomation.
* Skapa timers, stoppur och övergångar direkt från flödeskort, inget behov av förkonfiguration.
* Starta timers med en varaktighet i millisekunder (fraktionella sekunder), sekunder, minuter, timmar eller dagar.
* Starta stoppur utan en fördefinierad sluttid.
* Starta övergångar för att gradvis ändra en enhetsparameter över tid.
* Utlös flöden vid exakta timer- eller stoppurtider med millisekunds (fraktionella sekunder) precision.
* Pausa och återuppta timers, stoppur och övergångar med åtgärdskort eller från inställningar.
* Stöd för slumpmässiga eller beräknade varaktigheter eller justeringar med enkla matematiska uttryck.
* Alla timers, stoppur och övergångar är beständiga över Homey omstarter.
* Rikta flera timers, stoppur och övergångar samtidigt med hjälp av jokertecken i stödda kort.
* Använd matematiska uttryck inom flödeskort.
* Använd HomeyScript för att trigga eller ställa in timers, stoppur och övergångar.

Start-, återuppta- och justera-åtgärdskort har inbyggt stöd för enkla matematiska uttryck. Detta tillåter slumpmässiga eller beräknade timer- och stoppurvaraktigheter, inklusive beräkningar baserade på token-värden.
Till exempel:

	ceil(99.5) / 5
	pick(1, 3, 5, 9) * 2
	random(10, 30)
	abs(-10)

Förutom de tillgängliga flödeskorten kan timers och stoppur också styras med [HomeyScript](https://homeyscript.homey.app).

Till exempel, detta skript kommer att stoppa alla pågående timers:

	let app = await Homey.apps.getApp({id:'nl.fellownet.chronograph'});
	app.apiGet('/timers').then(result => {
		let timers = JSON.parse(result);
		timers.forEach(timer => {
			app.apiDelete('/timers/' + timer.id);
		});
	});

Se ämnet på Community Forum för mer information!