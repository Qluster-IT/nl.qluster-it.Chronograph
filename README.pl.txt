FUNKCJE

* Intuicyjne karty przepływu dla łatwej integracji timerów, stoperów i przejść w Twojej automatyzacji domowej,
* Twórz timery, stopery i przejścia bezpośrednio z kart przepływu, bez konieczności wstępnej konfiguracji,
* Uruchamiaj timery z czasem trwania w milisekundach (ułamki sekund), sekundach, minutach, godzinach lub dniach,
* Uruchamiaj stopery bez z góry określonego czasu zakończenia,
* Uruchamiaj przejścia, aby stopniowo zmieniać parametr urządzenia w czasie,
* Wywołuj przepływy w dokładnych czasach trwania timerów lub stoperów z precyzją do milisekundy (ułamki sekund),
* Wstrzymuj i wznawiaj timery, stopery i przejścia za pomocą kart akcji lub z poziomu ustawień,
* Wsparcie dla losowych lub obliczanych czasów trwania lub dostosowań za pomocą prostych wyrażeń matematycznych,
* Wszystkie timery, stopery i przejścia są trwałe podczas ponownych uruchomień Homey,
* Docelowo wiele timerów, stoperów i przejść naraz za pomocą symboli wieloznacznych w obsługiwanych kartach.

PROSTE WYRAŻENIA MATEMATYCZNE

Karty akcji uruchom, wznów i dostosuj mają wbudowane wsparcie dla prostych wyrażeń matematycznych. Umożliwia to losowe lub obliczone czas trwania timerów i stoperów, w tym obliczenia oparte na wartościach tokenów.

Na przykład:

	ceil(99.5) / 5
	pick(1, 3, 5, 9) * 2
	random(10, 30)
	abs(-10)

Oprócz podstawowych wyrażeń matematycznych, obsługiwane są następujące funkcje:

* abs(x) - oblicza wartość absolutną liczby,
* ceil(x) - zaokrągla liczbę w górę do następnej całej liczby,
* floor(x) - zaokrągla liczbę w dół do poprzedniej całej liczby,
* round(x) - zaokrągla liczbę do najbliższej całej liczby,
* random(min, max) - losowa liczba większa lub równa min i mniejsza niż max,
* min(x, y) - najniższa liczba z podanej listy,
* max(x, y) - największa liczba z podanej listy,
* pick(x, y[, n]) - wybiera losową wartość z podanej listy.

HOMEYSCRIPT

Oprócz dostępnych kart przepływu, timery i stopery mogą być również kontrolowane za pomocą [HomeyScript](https://homeyscript.homey.app).

Na przykład, ten skrypt zatrzyma wszystkie działające timery:

	let app = await Homey.apps.getApp({id:'nl.fellownet.chronograph'});
	app.apiGet('/timers').then(result => {
		let timers = JSON.parse(result);
		timers.forEach(timer => {
			app.apiDelete('/timers/' + timer.id);
		});
	});

* GET /timers - pobiera listę wszystkich aktywnych timerów,
* GET /timers/:id - pobiera pojedynczy timer,
* PUT /timers/:id - wstrzymuje lub wznawia timer,
* DELETE /timers/:id - zatrzymuje timer.
* GET /stopwatches - pobiera listę wszystkich aktywnych stoperów,
* GET /stopwatches/:id - pobiera pojedynczy stoper,
* PUT /stopwatches/:id - wstrzymuje lub wznawia stoper,
* DELETE /stopwatches/:id - zatrzymuje stoper.
* GET /transitions - pobiera listę wszystkich aktywnych przejść,
* GET /transitions/:id - pobiera pojedyncze przejście,
* PUT /transitions/:id - wstrzymuje lub wznawia przejście,
* DELETE /transitions/:id - zatrzymuje przejście.