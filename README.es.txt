FUNCIONALIDADES

* Tarjetas de flujo autoexplicativas para una fácil integración de temporizadores, cronómetros y transiciones en tu automatización del hogar.
* Crea temporizadores, cronómetros y transiciones directamente desde las tarjetas de flujo, sin necesidad de configuración previa.
* Inicia temporizadores con una duración en milisegundos (fracciones de segundo), segundos, minutos, horas o días.
* Inicia cronómetros sin un tiempo de finalización predefinido.
* Inicia transiciones para cambiar gradualmente un parámetro del dispositivo con el tiempo.
* Activa flujos a duraciones exactas de temporizadores o cronómetros con precisión de milisegundos (fracciones de segundo).
* Pausa y reanuda temporizadores, cronómetros y transiciones con tarjetas de acción o desde la configuración.
* Soporte para duraciones o ajustes aleatorios o calculados usando expresiones matemáticas simples.
* Todos los temporizadores, cronómetros y transiciones son persistentes a través de reinicios de Homey.
* Dirige múltiples temporizadores, cronómetros y transiciones a la vez usando comodines en tarjetas compatibles.
* Usa Expresiones Matemáticas dentro de las tarjetas de flujo.
* Usa HomeyScript para activar o establecer temporizadores, cronómetros y transiciones.

Las tarjetas de acción de inicio, reanudación y ajuste tienen soporte integrado para expresiones matemáticas simples. Esto permite duraciones de temporizador y cronómetro aleatorias o calculadas, incluidas cálculos basados en valores de token.
Por ejemplo:

	ceil(99.5) / 5
	pick(1, 3, 5, 9) * 2
	random(10, 30)
	abs(-10)

Además de las tarjetas de flujo disponibles, los temporizadores y cronómetros también pueden ser controlados usando [HomeyScript](https://homeyscript.homey.app).

Por ejemplo, este script detendrá todos los temporizadores en ejecución:

	let app = await Homey.apps.getApp({id:'nl.fellownet.chronograph'});
	app.apiGet('/timers').then(result => {
		let timers = JSON.parse(result);
		timers.forEach(timer => {
			app.apiDelete('/timers/' + timer.id);
		});
	});

¡Consulta el tema en el Foro de la Comunidad para más información!