FUNKTIONER

* Selvforklarende flow-kort til nem integration af timere, stopure og overgange i din hjemmeautomatisering.
* Opret timere, stopure og overgange direkte fra flow-kort, uden behov for forudgående konfiguration.
* Start timere med en varighed i millisekunder (brøkdele af sekunder), sekunder, minutter, timer eller dage.
* Start stopure uden en foruddefineret slut tid.
* Start overgange for gradvist at ændre en enheds parameter over tid.
* Udøser flows på præcise timer- eller stopur-varigheder med millisekunders (brøkdele af sekunder) præcision.
* Sæt pauser og genoptag timere, stopure og overgange med handlingskort eller fra indstillinger.
* Understøttelse af tilfældige eller beregnede varigheder eller justeringer ved brug af simple matematiske udtryk.
* Alle timere, stopure og overgange er vedholdende over Homey genstart.
* Ret flere timere, stopure og overgange på én gang ved at bruge wildcards i understøttede kort.
* Brug matematiske udtryk inde i flowcards.
* Brug HomeyScript til at udløse eller sætte timere, stopure og overgange.

Start-, genoptag- og justerings handlingskort har indbygget understøttelse for simple matematiske udtryk. Dette muliggør tilfældige eller beregnede timer- og stopur-varigheder, inklusiv beregninger baseret på tokenværdier.
For eksempel:

	ceil(99.5) / 5
	pick(1, 3, 5, 9) * 2
	random(10, 30)
	abs(-10)

Ud over de tilgængelige flow-kort, kan timere og stopure også kontrolleres ved brug af [HomeyScript](https://homeyscript.homey.app).

For eksempel, dette script vil stoppe alle kørende timere:

	lad app = await Homey.apps.getApp({id:'nl.fellownet.chronograph'});
	app.apiGet('/timers').then(resultat => {
		lad timere = JSON.parse(resultat);
		timere.forEach(timer => {
			app.apiDelete('/timers/' + timer.id);
		});
	});

Se emnet på Community Forum for mere information!