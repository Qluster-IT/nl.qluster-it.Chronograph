FUNKTIONEN

* Selbsterklärende Flow-Karten für einfache Integration von Timern, Stoppuhren und Übergängen in deine Heimautomatisierung,
* Erstelle Timer, Stoppuhren und Übergänge direkt von Flow-Karten aus, ohne vorherige Konfiguration,
* Starte Timer mit einer Dauer in Millisekunden (Bruchteil von Sekunden), Sekunden, Minuten, Stunden oder Tagen,
* Starte Stoppuhren ohne ein vordefiniertes Endzeitpunkt,
* Starte Übergänge, um einen Geräteparameter im Laufe der Zeit allmählich zu ändern,
* Trigger-Flows bei exakten Timer- oder Stoppuhrdauern mit Millisekunden-Präzision,
* Pausiere und setze Timer, Stoppuhren und Übergänge mit Aktionskarten oder in den Einstellungen fort,
* Unterstützung für zufällige oder berechnete Dauern oder Anpassungen mit einfachen mathematischen Ausdrücken,
* Alle Timer, Stoppuhren und Übergänge sind über Homey-Neustarts hinweg persistent,
* Ziele mehrere Timer, Stoppuhren und Übergänge gleichzeitig mit Wildcards in unterstützten Karten an.

EINFACHE MATHEMATISCHE AUSDRÜCKE

Die Start-, Fortsetzungs- und Anpassungsaktionskarten unterstützen eingebaute einfache mathematische Ausdrücke. Dies ermöglicht zufällige oder berechnete Dauer von Timern und Stoppuhren, einschließlich Berechnungen basierend auf Token-Werten.

Zum Beispiel:

	ceil(99.5) / 5
	pick(1, 3, 5, 9) * 2
	random(10, 30)
	abs(-10)

Neben einfachen mathematischen Ausdrücken werden die folgenden Funktionen unterstützt:

* abs(x) - berechnet den absoluten Wert einer Zahl,
* ceil(x) - rundet eine Zahl auf die nächste ganze Zahl auf,
* floor(x) - rundet eine Zahl auf die vorherige ganze Zahl ab,
* round(x) - rundet eine Zahl auf die nächstgelegene ganze Zahl,
* random(min, max) - eine Zufallszahl größer oder gleich min und kleiner als max,
* min(x, y) - die niedrigste Zahl aus der angegebenen Liste,
* max(x, y) - die größte Zahl aus der angegebenen Liste,
* pick(x, y[, n]) - wählt einen zufälligen Wert aus der angegebenen Liste.

HOMEYSCRIPT

Zusätzlich zu den verfügbaren Flow-Karten können Timer und Stoppuhren auch mit [HomeyScript](https://homeyscript.homey.app) gesteuert werden.

Zum Beispiel stoppt dieses Skript alle laufenden Timer:

	let app = await Homey.apps.getApp({id:'nl.fellownet.chronograph'});
	app.apiGet('/timers').then(result => {
		let timers = JSON.parse(result);
		timers.forEach(timer => {
			app.apiDelete('/timers/' + timer.id);
		});
	});

* GET /timers - ruft eine Liste aller aktiven Timer ab,
* GET /timers/:id - ruft einen einzelnen Timer ab,
* PUT /timers/:id - pausiert oder setzt einen Timer fort,
* DELETE /timers/:id - stoppt einen Timer.
* GET /stopwatches - ruft eine Liste aller aktiven Stoppuhren ab,
* GET /stopwatches/:id - ruft eine einzelne Stoppuhr ab,
* PUT /stopwatches/:id - pausiert oder setzt eine Stoppuhr fort,
* DELETE /stopwatches/:id - stoppt eine Stoppuhr.
* GET /transitions - ruft eine Liste aller aktiven Übergänge ab,
* GET /transitions/:id - ruft einen einzelnen Übergang ab,
* PUT /transitions/:id - pausiert oder setzt einen Übergang fort,
* DELETE /transitions/:id - stoppt einen Übergang.