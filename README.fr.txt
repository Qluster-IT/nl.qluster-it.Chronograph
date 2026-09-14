CARACTÉRISTIQUES

* Cartes de flux explicites pour une intégration facile des minuteries, chronomètres et transitions dans votre automatisation domestique,
* Créez des minuteries, chronomètres et transitions directement depuis les cartes de flux, pas besoin de configuration préalable,
* Démarrez des minuteries avec une durée en millisecondes (secondes fractionnaires), secondes, minutes, heures ou jours,
* Démarrez des chronomètres sans temps de fin prédéfini,
* Démarrez des transitions pour changer progressivement un paramètre d'un appareil au fil du temps,
* Déclenchez des flux à des durées exactes de minuterie ou chronomètre avec une précision de milliseconde (secondes fractionnaires),
* Mettez en pause et reprenez les minuteries, chronomètres et transitions avec des cartes d'action ou depuis les paramètres,
* Support pour des durées ou ajustements aléatoires ou calculés en utilisant des expressions mathématiques simples,
* Toutes les minuteries, chronomètres et transitions sont persistants à travers les redémarrages de Homey,
* Ciblez plusieurs minuteries, chronomètres et transitions à la fois en utilisant des jokers dans les cartes prises en charge.

EXPRESSIONS MATHÉMATIQUES SIMPLES

Les cartes d'action de démarrage, reprise et ajustement incluent des expressions mathématiques simples. Cela permet des durées de minuterie et chronomètre aléatoires ou calculées, y compris des calculs basés sur des valeurs de jetons.

Par exemple :

	ceil(99.5) / 5
	pick(1, 3, 5, 9) * 2
	random(10, 30)
	abs(-10)

En plus des expressions mathématiques de base, les fonctions suivantes sont prises en charge :

* abs(x) - calcule la valeur absolue d'un nombre,
* ceil(x) - arrondit un nombre à la hausse au nombre entier suivant,
* floor(x) - arrondit un nombre à la baisse au nombre entier précédent,
* round(x) - arrondit un nombre vers le nombre entier le plus proche,
* random(min, max) - un nombre aléatoire supérieur ou égal à min et inférieur à max,
* min(x, y) - le plus petit nombre de la liste fournie,
* max(x, y) - le plus grand nombre de la liste fournie,
* pick(x, y[, n]) - choisit une valeur aléatoire de la liste fournie.

HOMEYSCRIPT

En plus des cartes de flux disponibles, les minuteries et chronomètres peuvent également être contrôlés à l'aide de [HomeyScript](https://homeyscript.homey.app).

Par exemple, ce script arrêtera toutes les minuteries en cours :

	let app = await Homey.apps.getApp({id:'nl.fellownet.chronograph'});
	app.apiGet('/timers').then(result => {
		let timers = JSON.parse(result);
		timers.forEach(timer => {
			app.apiDelete('/timers/' + timer.id);
		});
	});

* GET /timers - récupère une liste de toutes les minuteries actives,
* GET /timers/:id - récupère une seule minuterie,
* PUT /timers/:id - met en pause ou reprend une minuterie,
* DELETE /timers/:id - arrête une minuterie.
* GET /stopwatches - récupère une liste de tous les chronomètres actifs,
* GET /stopwatches/:id - récupère un seul chronomètre,
* PUT /stopwatches/:id - met en pause ou reprend un chronomètre,
* DELETE /stopwatches/:id - arrête un chronomètre.
* GET /transitions - récupère une liste de toutes les transitions actives,
* GET /transitions/:id - récupère une seule transition,
* PUT /transitions/:id - met en pause ou reprend une transition,
* DELETE /transitions/:id - arrête une transition.