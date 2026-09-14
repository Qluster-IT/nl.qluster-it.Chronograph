CARATTERISTICHE

* Schede di flusso autoesplicative per un'integrazione semplice di timer, cronometri e transizioni nella tua automazione domestica,
* Crea timer, cronometri e transizioni direttamente dalle schede di flusso, senza bisogno di configurazioni precedenti,
* Avvia timer con una durata in millisecondi (secondi frazionari), secondi, minuti, ore o giorni,
* Avvia cronometri senza un tempo finale predefinito,
* Avvia transizioni per modificare gradualmente un parametro del dispositivo nel tempo,
* Attiva flussi a durate esatte di timer o cronometri con precisione al millisecondo (secondi frazionari),
* Metti in pausa e riprendi timer, cronometri e transizioni con schede azione o dalle impostazioni,
* Supporto per durate o regolazioni casuali o calcolate usando espressioni matematiche semplici,
* Tutti i timer, cronometri e transizioni sono persistenti attraverso i riavvii di Homey,
* Destina più timer, cronometri e transizioni contemporaneamente usando caratteri jolly nelle schede supportate.

ESPRESSONI MATEMATICHE SEMPLICI

Le schede azione di avvio, ripresa e regolazione supportano incorporato espressioni matematiche semplici. Ciò consente durate casuali o calcolate per timer e cronometri, comprese le operazioni basate su valori token.

Per esempio:

	ceil(99.5) / 5
	pick(1, 3, 5, 9) * 2
	random(10, 30)
	abs(-10)

Oltre alle espressioni matematiche di base, sono supportate le seguenti funzioni:

* abs(x) - calcola il valore assoluto di un numero,
* ceil(x) - arrotonda un numero per eccesso al prossimo numero intero,
* floor(x) - arrotonda un numero per difetto al numero intero precedente,
* round(x) - arrotonda un numero al numero intero più vicino,
* random(min, max) - un numero casuale maggiore o uguale a min e minore di max,
* min(x, y) - il numero più basso dalla lista fornita,
* max(x, y) - il numero più grande dalla lista fornita,
* pick(x, y[, n]) - scegliere un valore casuale dalla lista fornita.

HOMEYSCRIPT

Oltre alle schede di flusso disponibili, i timer e i cronometri possono anche essere controllati utilizzando [HomeyScript](https://homeyscript.homey.app).

Per esempio, questo script fermerà tutti i timer in esecuzione:

	let app = await Homey.apps.getApp({id:'nl.fellownet.chronograph'});
	app.apiGet('/timers').then(result => {
		let timers = JSON.parse(result);
		timers.forEach(timer => {
			app.apiDelete('/timers/' + timer.id);
		});
	});

* GET /timers - recupera una lista di tutti i timer attivi,
* GET /timers/:id - recupera un singolo timer,
* PUT /timers/:id - mette in pausa o riprende un timer,
* DELETE /timers/:id - ferma un timer.
* GET /stopwatches - recupera una lista di tutti i timer attivi,
* GET /stopwatches/:id - recupera un singolo timer,
* PUT /stopwatches/:id - mette in pausa o riprende un timer,
* DELETE /stopwatches/:id - ferma un timer.
* GET /transitions - recupera una lista di tutte le transizioni attive,
* GET /transitions/:id - recupera una singola transizione,
* PUT /transitions/:id - mette in pausa o riprende una transizione,
* DELETE /transitions/:id - ferma una transizione.