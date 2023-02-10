FEATURES

* Selbsterklärende Flow-Karten zur einfachen Nutzung von Timern, Stoppuhren und Übergängen in Ihrer Hausautomation
* Erstellen Sie Timer, Stoppuhren und Übergänge direkt mittels Flow-Karten, ohne dass eine vorherige Konfiguration erforderlich ist
* Starten Sie Timer mit einer Dauer in Millisekunden, Sekunden, Minuten, Stunden oder Tagen
* Starten Sie Stoppuhren ohne vordefinierte Endzeit
* Starten Sie Übergänge, um einen Geräteparameter schrittweise zu ändern
* Triggern Sie Flows mit exakten Timer- oder Stoppuhrdauern und einer Genauigkeit im Millisekundenbereich
* Timer, Stoppuhren und Übergänge mit Flow-Karten oder über die Einstellungen anhalten und fortsetzen
* Unterstützung für zufällige oder berechnete Dauern oder Anpassungen mit einfachen mathematischen Berechnungen
* Mit einfachen mathematischen Funktionen können zufällige oder genaue Dauern berechnet werden
* Alle Timer, Stoppuhren und Übergänge bleiben bei einem Homey-Neustart erhalten
* Mit Hilfe von Wildcards in den entsprechenden Karten ist es möglich, mehrere Timer, Stoppuhren und Übergänge gleichzeitig zu steuern

SIMPLE MATH EXPRESSIONS

Die Aktionskarten „Start“, „Fortsetzen“ und „Anpassen“ verfügen über eine integrierte Unterstützung für einfache mathematische Funktionen.
Dies ermöglicht zufällige oder berechnete Timer- und Stoppuhrdauern, einschließlich Berechnungen basierend auf Tokenwerten.

Beispiel:

	ceil(99.5) / 5
	pick(1, 3, 5, 9) * 2
	random(10, 30)
	abs(-10)

Zusätzlich zu den grundlegenden mathematischen Funktionen werden die folgenden Funktionen unterstützt:

* abs(x) - berechnet den absoluten Wert einer Zahl
* ceil(x) - rundet eine Zahl auf die nächste ganze Zahl auf
* floor(x) - rundet eine Zahl auf die vorherige ganze Zahl ab
* round(x) - rundet eine Zahl auf die nächste ganze Zahl
* random(min, max) - berechnet eine Zufallszahl, die größer oder gleich Min und kleiner als Max ist
* min(x, y) - die niedrigste Zahl aus der entsprechenden Liste
* max(x, y) - die größte Zahl aus der entsprechenden Liste
* pick(x, y[, n]) - ein Zufallswert aus der entsprechenden Liste

HOMEYSCRIPT

Zusätzlich zu den verfügbaren Flow-Karten können Timer und Stoppuhren auch über [HomeyScript](https://homeyscript.homey.app) gesteuert werden.

Beispiel: Dieses Script stoppt alle aktiven Timer:

	let app = await Homey.apps.getApp({id:'nl.fellownet.chronograph'});
	app.apiGet('/timers').then(result => {
		let timers = JSON.parse(result);
		timers.forEach(timer => {
			app.apiDelete('/timers/' + timer.id);
		});
	});

* GET /timers - ruft eine Liste aller aktiven Timer auf
* GET /timers/:id - ruft einen einzelnen Timer auf
* PUT /timers/:id - pausiert einen Timer oder führt diesen fort
* DELETE /timers/:id - stoppt einen Timer
* GET /stopwatches - ruft eine Liste aller aktiven Stoppuhren auf
* GET /stopwatches/:id - ruft eine einzelne Stoppuhr auf
* PUT /stopwatches/:id - pausiert eine Stoppuhr oder führt diese fort
* DELETE /stopwatches/:id - stoppt eine Stoppuhr
* GET /transitions - ruft eine Liste aller aktiven Übergänge auf
* GET /transitions/:id - ruft einen einzelnen Übergang auf
* PUT /transitions/:id - pausiert einen Übergang oder führt diesen fort
* DELETE /transitions/:id - stoppt einen Übergang