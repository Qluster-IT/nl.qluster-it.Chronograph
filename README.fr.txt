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
* Le widget Chronograph du tableau de bord permet de choisir dans ses paramètres un minuteur, un chronomètre ou une transition, puis de le mettre en pause, de le reprendre ou de l'arrêter.
* Utilisez des expressions mathématiques à l'intérieur des cartes de flux.
* Utilisez HomeyScript pour surveiller, mettre en pause, reprendre ou arrêter les minuteries, chronomètres et transitions actifs.

Les cartes d'action start, resume et adjust ont un support intégré pour les simples expressions mathématiques. Cela permet des durées de minuterie et de chronomètre aléatoires ou calculées, y compris des calculs basés sur les valeurs des jetons.
Par exemple :

	ceil(99.5) / 5
	pick(1, 3, 5, 9) * 2
	random(10, 30)
	abs(-10)

En plus des cartes de flux disponibles, les minuteries et chronomètres peuvent également être contrôlés à l'aide de HomeyScript.

Par exemple, ce script arrêtera toutes les minuteries en cours :

	const app = await Homey.apps.getApp({ id: 'nl.fellownet.chronograph' });
	const timers = await app.get({ path: '/timers/' });
	for (const timer of timers) {
		if (timer.running) {
			await app.delete({ path: '/timers/' + encodeURIComponent(timer.name) });
		}
	}

Consultez le sujet sur le forum communautaire pour plus d'informations !
Pour accéder au wiki Chronograph, au guide d'utilisation et à la référence de l'API, sélectionnez "Visiter le site web" sous "Site web du développeur" sur la page de cette application dans le Homey App Store.