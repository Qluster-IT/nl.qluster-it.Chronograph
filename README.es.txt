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
* El widget de Chronograph para el panel permite elegir en sus ajustes un temporizador, cronómetro o transición y pausarlo, reanudarlo o detenerlo.
* Usa Expresiones Matemáticas dentro de las tarjetas de flujo.
* Usa HomeyScript para supervisar, pausar, reanudar o detener temporizadores, cronómetros y transiciones activos.

Las tarjetas de acción de inicio, reanudación y ajuste tienen soporte integrado para expresiones matemáticas simples. Esto permite duraciones de temporizador y cronómetro aleatorias o calculadas, incluidas cálculos basados en valores de token.
Por ejemplo:

	ceil(99.5) / 5
	pick(1, 3, 5, 9) * 2
	random(10, 30)
	abs(-10)

Además de las tarjetas de flujo disponibles, los temporizadores y cronómetros también pueden ser controlados usando [HomeyScript](https://homeyscript.homey.app).

Por ejemplo, este script detendrá todos los temporizadores en ejecución:

	const app = await Homey.apps.getApp({ id: 'nl.fellownet.chronograph' });
	const timers = await app.get({ path: '/timers/' });
	for (const timer of timers) {
		if (timer.running) {
			await app.delete({ path: '/timers/' + encodeURIComponent(timer.id) });
		}
	}

¡Consulta el tema en el Foro de la Comunidad para más información!