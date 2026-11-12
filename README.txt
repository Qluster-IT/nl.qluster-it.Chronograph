FEATURES

* Self-explanatory flow cards for easy integration of timers, stopwatches and transitions in your home automation.
* Create timers, stopwatches and transitions directly from flow cards, no need for a prior configuration.
* Start timers with a duration in milliseconds (fractional seconds), seconds, minutes, hours or days.
* Start stopwatches without a predefined end time.
* Start transitions to gradually change a device parameter over time.
* Trigger flows at exact timer- or stopwatch durations with millisecond (fractional seconds) precision.
* Pause and resume timers, stopwatches and transitions with action cards or from within settings.
* Support for random or computed durations or adjustments using simple math expressions.
* All timers, stopwatches and transitions are persistent across Homey restarts.
* Target multiple timers, stopwatches and transitions at once using wildcards in supported cards.
* Use the Chronograph dashboard widget to choose a timer, stopwatch or transition in its settings and pause, resume or stop it.
* Use Math Expressions inside flowcards.
* Use HomeyScript to monitor, pause, resume or stop active timers, stopwatches and transitions.

The start, resume and adjust action cards have built-in support for simple math expressions. This allows for random or computed timer and stopwatch durations, including calculations based on token values.
For example:

	ceil(99.5) / 5
	pick(1, 3, 5, 9) * 2
	random(10, 30)
	abs(-10)

In addition to the available flow cards, timers and stopwatches can also be controlled using [HomeyScript](https://homeyscript.homey.app).

For example, this script will stop all running timers:

	const app = await Homey.apps.getApp({ id: 'nl.fellownet.chronograph' });
	const timers = await app.get({ path: '/timers/' });
	for (const timer of timers) {
		if (timer.running) {
			await app.delete({ path: '/timers/' + encodeURIComponent(timer.id) });
		}
	}

See the topic on the Community Forum for more information!