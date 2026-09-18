FUNKCJE

* Przejrzyste karty przepływów dla łatwej integracji timerów, stoperów i przejść w automatyce domowej.
* Twórz timery, stopery i przejścia bezpośrednio z kart przepływów, bez potrzeby wcześniejszej konfiguracji.
* Uruchamiaj timery z czasem trwania w milisekundach (części sekundy), sekundach, minutach, godzinach lub dniach.
* Uruchamiaj stopery bez z góry określonego czasu zakończenia.
* Uruchamiaj przejścia, aby stopniowo zmieniać parametr urządzenia w czasie.
* Wyzwalaj przepływy w dokładnie określonym czasie trwania timera lub stopera z precyzją do milisekund (części sekundy).
* Wstrzymuj i wznawiaj timery, stopery i przejścia za pomocą kart działania lub w ustawieniach.
* Wsparcie dla losowych lub obliczanych czasów trwania lub regulacji za pomocą prostych wyrażeń matematycznych.
* Wszystkie timery, stopery i przejścia są trwałe nawet po ponownym uruchomieniu Homey.
* Kieruj wiele timerów, stoperów i przejść naraz używając symboli wieloznacznych w obsługiwanych kartach.
* Używaj wyrażeń matematycznych w kartach przepływów.
* Używaj HomeyScript do wyzwalania lub ustawiania timerów, stoperów i przejść.

Karty akcji start, resume i adjust mają wbudowaną obsługę prostych wyrażeń matematycznych. Pozwala to na losowe lub obliczane czasy trwania timerów i stoperów, w tym obliczenia oparte na wartościach tokenów.
Na przykład:

	ceil(99.5) / 5
	pick(1, 3, 5, 9) * 2
	random(10, 30)
	abs(-10)

Oprócz dostępnych kart przepływów, timery i stopery mogą być również kontrolowane za pomocą [HomeyScript](https://homeyscript.homey.app).

Na przykład, ten skrypt zatrzyma wszystkie działające timery:

	let app = await Homey.apps.getApp({id:'nl.fellownet.chronograph'});
	app.apiGet('/timers').then(result => {
		let timers = JSON.parse(result);
		timers.forEach(timer => {
			app.apiDelete('/timers/' + timer.id);
		});
	});

Zobacz temat na Forum Społeczności, aby uzyskać więcej informacji!