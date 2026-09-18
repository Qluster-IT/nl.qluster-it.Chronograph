FEATURES

* Selbsterklärende Flow-Karten zur einfachen Integration von Timern, Stoppuhren und Übergängen in deine Hausautomation.
* Erstelle Timer, Stoppuhren und Übergänge direkt aus Flow-Karten, ohne vorherige Konfiguration.
* Starte Timer mit einer Dauer in Millisekunden (bruchstückhafte Sekunden), Sekunden, Minuten, Stunden oder Tagen.
* Starte Stoppuhren ohne vordefiniertes Endzeitpunkt.
* Starte Übergänge, um Geräteparameter im Laufe der Zeit schrittweise zu ändern.
* Löse Flows bei exakten Timer- oder Stoppuhren-Dauern mit Millisekunden-Präzision aus.
* Pausiere und setze Timer, Stoppuhren und Übergänge mit Aktionskarten oder aus den Einstellungen fort.
* Unterstützung für zufällige oder berechnete Dauern oder Anpassungen mithilfe einfacher mathematischer Ausdrücke.
* Alle Timer, Stoppuhren und Übergänge bleiben bei Homey-Neustarts erhalten.
* Richte mehrere Timer, Stoppuhren und Übergänge gleichzeitig mit Platzhaltern in unterstützten Karten aus.
* Verwende Mathematik-Ausdrücke innerhalb von Flow-Karten.
* Nutze HomeyScript, um Timer, Stoppuhren und Übergänge auszulösen oder einzustellen.

Die Start-, Fortsetzungs- und Anpassungsaktionskarten unterstützen eingebaute einfache mathematische Ausdrücke. Dies ermöglicht zufällige oder berechnete Timer- und Stoppuhren-Dauern, einschließlich Berechnungen basierend auf Token-Werten.
Zum Beispiel:

	ceil(99.5) / 5
	pick(1, 3, 5, 9) * 2
	random(10, 30)
	abs(-10)

Neben den verfügbaren Flow-Karten können Timer und Stoppuhren auch mit [HomeyScript](https://homeyscript.homey.app) gesteuert werden.

Zum Beispiel, dieses Skript wird alle laufenden Timer stoppen:

	let app = await Homey.apps.getApp({id:'nl.fellownet.chronograph'});
	app.apiGet('/timers').then(result => {
		let timers = JSON.parse(result);
		timers.forEach(timer => {
			app.apiDelete('/timers/' + timer.id);
		});
	});

Sieh dir das Thema im Community-Forum für weitere Informationen an!