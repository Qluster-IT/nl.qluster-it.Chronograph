CARACTERÍSTICAS

* Tarjetas de flujo autoexplicativas para una fácil integración de temporizadores, cronómetros y transiciones en tu automatización del hogar,
* Crea temporizadores, cronómetros y transiciones directamente desde tarjetas de flujo, sin necesidad de una configuración previa,
* Inicia temporizadores con una duración en milisegundos (fracciones de segundo), segundos, minutos, horas o días,
* Inicia cronómetros sin un tiempo de fin predefinido,
* Inicia transiciones para cambiar gradualmente un parámetro de un dispositivo con el tiempo,
* Dispara flujos a duraciones exactas de temporizadores o cronómetros con precisión en milisegundos (fracciones de segundo),
* Pausa y reanuda temporizadores, cronómetros y transiciones con tarjetas de acción o desde la configuración,
* Soporte para duraciones o ajustes aleatorios o calculados usando expresiones matemáticas simples,
* Todos los temporizadores, cronómetros y transiciones son persistentes a través de reinicios de Homey,
* Apunta a múltiples temporizadores, cronómetros y transiciones a la vez usando comodines en tarjetas compatibles.

EXPRESIONES MATEMÁTICAS SIMPLES

Las tarjetas de acción de inicio, reanudación y ajuste tienen soporte incorporado para expresiones matemáticas simples. Esto permite duraciones de temporizador y cronómetro aleatorias o calculadas, incluyendo cálculos basados en valores token.

Por ejemplo:

	ceil(99.5) / 5
	pick(1, 3, 5, 9) * 2
	random(10, 30)
	abs(-10)

Además de las expresiones matemáticas básicas, se soportan las siguientes funciones:

* abs(x) - calcula el valor absoluto de un número,
* ceil(x) - redondea un número hacia arriba al número entero siguiente,
* floor(x) - redondea un número hacia abajo al número entero anterior,
* round(x) - redondea un número hacia el número entero más cercano,
* random(min, max) - un número aleatorio mayor o igual a min y menor que max,
* min(x, y) - el número más bajo de la lista proporcionada,
* max(x, y) - el número más grande de la lista proporcionada,
* pick(x, y[, n]) - elige un valor aleatorio de la lista proporcionada.

HOMEYSCRIPT

Además de las tarjetas de flujo disponibles, los temporizadores y cronómetros también pueden ser controlados usando [HomeyScript](https://homeyscript.homey.app).

Por ejemplo, este script detendrá todos los temporizadores en ejecución:

	let app = await Homey.apps.getApp({id:'nl.fellownet.chronograph'});
	app.apiGet('/timers').then(result => {
		let timers = JSON.parse(result);
		timers.forEach(timer => {
			app.apiDelete('/timers/' + timer.id);
		});
	});

* GET /timers - obtiene una lista de todos los temporizadores activos,
* GET /timers/:id - obtiene un solo temporizador,
* PUT /timers/:id - pausa o reanuda un temporizador,
* DELETE /timers/:id - detiene un temporizador.
* GET /stopwatches - obtiene una lista de todos los cronómetros activos,
* GET /stopwatches/:id - obtiene un solo cronómetro,
* PUT /stopwatches/:id - pausa o reanuda un cronómetro,
* DELETE /stopwatches/:id - detiene un cronómetro.
* GET /transitions - obtiene una lista de todas las transiciones activas,
* GET /transitions/:id - obtiene una sola transición,
* PUT /transitions/:id - pausa o reanuda una transición,
* DELETE /transitions/:id - detiene una transición.