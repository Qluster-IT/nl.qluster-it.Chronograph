# Chronograph

Adds precise timer, stopwatch and transition functionality to Homey.
[![Donate](https://img.shields.io/badge/paypal-donate-blue.svg)](https://www.paypal.me/qlusterit)

## Features

* Self-explanatory flow cards for easy integration of timers, stopwatches and transitions in your home automation,
* Create timers, stopwatches and transitions directly from flow cards, no need for a prior configuration,
* Start timers with a duration in milliseconds (fractional seconds), seconds, minutes, hours or days,
* Start stopwatches without a predefined end time,
* Start transitions to gradually change a device parameter over time,
* Trigger flows at exact timer- or stopwatch durations with millisecond (fractional seconds) precision,
* Pause and resume timers, stopwatches and transitions with action cards or from within settings,
* Support for random or computed durations or adjustments using simple math expressions,
* All timers, stopwatches and transitions are persistent across Homey restarts,
* Target multiple timers, stopwatches and transitions at once using wildcards in supported cards.
* Use the Chronograph dashboard widget to choose a timer, stopwatch or transition in its settings and pause, resume or stop it.
* Choose a searchable Font Awesome Free icon for each dashboard widget, or select None.
* Set a timer or transition widget's default duration to 0 to use the last duration saved by a Flow or API start, if available.
* Transition widget default start, end and step values use the last saved Flow or API values when set to 0 or left empty.
* A Flow resume card also saves these values when it starts a chronograph that is not already active; resuming an existing one leaves them unchanged.

## User manual

See the [Chronograph wiki](https://github.com/Qluster-IT/nl.qluster-it.Chronograph/wiki) for usage, widgets, the designer, and the API reference.

## Development

### Local settings preview

The root `locales/` directory contains an empty JSON object for each language.
Homey Compose fills these files with generated translations when building; edit
translations in `.homeycompose/locales/`, not the generated files.

Run `npm --prefix tools/development run preview:settings` and open
`http://127.0.0.1:4178/settings/index.html`. Refresh after changing code.
The preview opens the Widgets tab by default; Homey settings keep their usual
default tab. The preview loads translations for the browser language; add `?lang=nl` or
`?lang=en` to choose a language. It reads translations directly from the Homey
Compose locale sources, without requiring generated locale files. Settings saved in this preview are stored
in the browser's local storage, not on Homey. In this local preview, all built-in
designs and color schemes are editable; Save stores a separate browser-only
snapshot under `chronograph-settings-preview:previewBuiltIns`. These changes
survive reloads but do not modify the app defaults or Homey. Share the saved
preview when requesting changes to the actual defaults. Chronographs are
sample data and reset when the page reloads. The preview does not load Homey's actual stylesheet or connect to a
Homey device, so final appearance and behavior still require a Homey check.
Press Ctrl+C in the terminal to stop the server. Set
`CHRONOGRAPH_PREVIEW_PORT` before starting it to use another port.

On Windows, regenerate the widget picker previews with
`.\tools\development\generate-widget-previews.ps1`.

## Contributing

To submit a bug report or feature request, please create an [issue at GitHub](https://github.com/Qluster-IT/nl.qluster-it.Chronograph/issues/new).

If you'd like to contribute code to this project, please read the
[CONTRIBUTING.md](https://github.com/Qluster-IT/nl.qluster-it.Chronograph/blob/master/CONTRIBUTING.md) document.

Install the development tools with `npm ci --prefix tools/development`, then run
the tests from the app root with `npm test`. This also installs the pre-commit
test hook when Git hooks are available. Development dependencies stay under
`tools/` and are excluded from the Homey app.

## Support

If you like this project, perhaps you can support us by making a donation?
- Paypal: [Donate](https://www.paypal.me/qlusterit)

## Credits

Widget icons use [Font Awesome Free 7.3.1](https://fontawesome.com), including solid, regular and brand icons. Choose an icon color from the widget settings; existing widgets default to blue. After None and the three default icons, results are grouped by regular, solid and brands. Search for `solid`, `regular`, or `brands` to filter by style, optionally combined with an icon name (for example, `regular clock`). Font Awesome's license is included in `assets/licenses/fontawesome-LICENSE.txt`.

To regenerate the widget icon previews after updating the icon catalog, run `npm ci --prefix tools/icon-previews` followed by `npm run generate:icon-previews`. The generator and its dependencies are excluded from the Homey app; the generated preview catalog remains in `assets/`.

Application image by [Agê Barros](https://unsplash.com/@agebarros?utm_source=unsplash&utm_medium=referral&utm_content=creditCopyText) on [Unsplash](https://unsplash.com/search/photos/time?utm_source=unsplash&utm_medium=referral&utm_content=creditCopyText).

## Changelog

### v2.3.0

* Added customizable timer, stopwatch and transition dashboard widgets with controls and Flow/API defaults.
* Clarified that the timer split Flow card uses remaining duration.
* Added a Flow card for elapsed timer duration.

### v1.1.2

* Fixed a timer display bug.
* Additional capabilities for monitoring.

### v1.1.1

* Ability to delay the execution of flows.
* Additional tokens for transition cards.
* Simplified monitoring of timers, stopwatches and transitions.

### v1.1.0

* Support for the new Homey App Store.
* Prevent stale chronographs after restart.

### v1.0.8

* Added the ability to use wildcards in various action and trigger cards.

### v1.0.7

* Added pause trigger cards.

### v1.0.6

* Added transitions to gradually change a value over time.
* Support for simple math expressions in timer, stopwatch and transition durations.

### v1.0.3

* German translation, thanks to [Copiis](https://github.com/copiis).

### v1.0.2

* Timers and stopwatches are now persistent across application restarts and Homey reboots.
* Pause and resume timers and stopwatches from flow cards.
* Fine-tuning of the settings page.
* Pause and resume timers and stopwatches from settings.
* Support for timers longer than 24.855 days.
* Unit testing.

### v1.0.1

* Added settings screen for overview and stop actions.
* Updated several flow descriptions.
* Fixed a missing import bug.
* Added stop trigger cards and duration tokens.

### v1.0.0

* First public release.
