CARACTÉRISTIQUES

* Cartes de flux explicites pour une intégration facile des minuteries, chronomètres et transitions dans votre domotique.
* Créez des minuteries, chronomètres et transitions directement depuis les cartes de flux, sans besoin de configuration préalable.
* Lancez des minuteries avec une durée en millisecondes (secondes fractionnelles), secondes, minutes, heures ou jours.
* Lancez des chronomètres sans heure de fin prédéfinie.
* Lancez des transitions pour modifier progressivement un paramètre d'appareil au fil du temps.
* Déclenchez des flux à des durées exactes de minuterie ou de chronomètre avec une précision à la milliseconde (secondes fractionnelles).
* Mettez en pause et reprenez minuteries, chronomètres et transitions avec des cartes d'action ou depuis les paramètres.
* Prise en charge des durées ou ajustements aléatoires ou calculés à l'aide de simples expressions mathématiques.
* Toutes les minuteries, chronomètres et transitions sont persistants lors des redémarrages de Homey.
* Ciblez plusieurs minuteries, chronomètres et transitions à la fois en utilisant des jokers dans les cartes prises en charge.
* Utilisez des expressions mathématiques à l'intérieur des cartes de flux.
* Utilisez HomeyScript pour déclencher ou régler des minuteries, chronomètres et transitions.

Les cartes d'action start, resume et adjust ont un support intégré pour les simples expressions mathématiques. Cela permet des durées de minuterie et de chronomètre aléatoires ou calculées, y compris des calculs basés sur les valeurs des jetons.
Par exemple :

	ceil(99.5) / 5
	pick(1, 3, 5, 9) * 2
	random(10, 30)
	abs(-10)

En plus des cartes de flux disponibles, les minuteries et chronomètres peuvent également être contrôlés à l'aide de [HomeyScript](https://homeyscript.homey.app).

Par exemple, ce script arrêtera toutes les minuteries en cours :

	let app = await Homey.apps.getApp({id:'nl.fellownet.chronograph'});
	app.apiGet('/timers').then(result => {
		let timers = JSON.parse(result);
		timers.forEach(timer => {
			app.apiDelete('/timers/' + timer.id);
		});
	});

Consultez le sujet sur le forum communautaire pour plus d'informations !