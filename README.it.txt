CARATTERISTICHE

* Carte di flusso intuitive per un'integrazione facile di timer, cronometri e transizioni nella tua automazione domestica.
* Crea timer, cronometri e transizioni direttamente dalle carte di flusso, senza bisogno di configurazione preliminare.
* Avvia timer con una durata in millisecondi (secondi frazionari), secondi, minuti, ore o giorni.
* Avvia cronometri senza un tempo di fine predefinito.
* Avvia transizioni per cambiare gradualmente un parametro del dispositivo nel tempo.
* Attiva flussi a durate esatte di timer o cronometri con precisione al millisecondo (secondi frazionari).
* Metti in pausa e riprendi timer, cronometri e transizioni con carte d'azione o dalle impostazioni.
* Supporto per durate o regolazioni casuali o calcolate usando semplici espressioni matematiche.
* Tutti i timer, cronometri e transizioni sono persistenti attraverso i riavvii di Homey.
* Target multipli per timer, cronometri e transizioni contemporaneamente usando wildcard nelle carte supportate.
* Usa Espressioni Matematiche all'interno delle carte di flusso.
* Usa HomeyScript per attivare o impostare timer, cronometri e transizioni.

Le carte d'azione per avviare, riprendere e regolare hanno il supporto integrato per semplici espressioni matematiche. Questo consente durate di timer e cronometri casuali o calcolate, inclusi calcoli basati su valori di token.
Ad esempio:

	ceil(99.5) / 5
	pick(1, 3, 5, 9) * 2
	random(10, 30)
	abs(-10)

Oltre alle carte di flusso disponibili, i timer e i cronometri possono anche essere controllati usando [HomeyScript](https://homeyscript.homey.app).

Ad esempio, questo script fermerà tutti i timer in esecuzione:

	let app = await Homey.apps.getApp({id:'nl.fellownet.chronograph'});
	app.apiGet('/timers').then(result => {
		let timers = JSON.parse(result);
		timers.forEach(timer => {
			app.apiDelete('/timers/' + timer.id);
		});
	});

Guarda l'argomento sul Forum della Comunità per ulteriori informazioni!