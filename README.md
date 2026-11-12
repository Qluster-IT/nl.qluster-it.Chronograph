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

### v3.0.0

* Added a multi-Chronograph widget with individually configurable tiles and up to three columns.
* Create custom widget layouts and color schemes with the widget designer.
* Improved translations.
* The Chronograph API now uses names instead of IDs. Update your scripts and integrations; see the [API wiki](https://github.com/Qluster-IT/nl.qluster-it.Chronograph/wiki).

### v2.3.1

* Added customizable timer, stopwatch and transition dashboard widgets with controls and Flow/API defaults.
* Clarified that the timer split Flow card uses remaining duration.
* Added a Flow card for elapsed timer duration.

### v2.2.4

* Moved the source code and issues from Bitbucket to GitHub.

### v2.2.3

* Added milliseconds to the delay condition Flow card.

### v2.2.2

* Translated the app into all supported languages.

### v2.1.10

* Fixed a timer start error caused by incorrect splits.

### v2.1.9

* Fixed more issues reported in the error log.

### v2.1.7

* Fixed a potential bug in the notification used to prevent a crash.

### v2.1.5

* Improved Flow card hints.

### v2.1.3

* Test version: attempted to resolve a stopwatch start bug.

### v2.1.2

* Fixed an API bug related to the SDK3 migration.

### v2.1.0

* Improved Flow descriptions, hints and argument descriptions.

### v2.0.12

* Improved descriptions for the elapsed and remaining duration Flow cards.

### v2.0.11

* Fixed saving the rounding setting for duration Flow cards.

### v2.0.10

* Fixed errors in timer and stopwatch splits.

### v2.0.5

* Fixed incorrect information returned by the API for all chronographs.

### v2.0.4

* Added the last-used time to chronographs in app settings.
* Added a name tag to duration Flow cards.

### v2.0.2

* Added the ability to create and select chronographs by name within Flow cards.

### v1.6.15

* Fixed chronograph updates sent to other apps so they are sent every second, not only on start and stop.

### v1.6.14

* Improved performance when no chronographs are running.

### v1.6.13

* Addressed startup issues on older models with many chronographs.

### v1.6.12

* Continued attempts to resolve the reported issue.

### v1.6.9

* Fixed issues and improved error handling and logging for installations with many chronographs.

### v1.6.4

* Fixed an older crash report.

### v1.6.0

* Added support for other apps to listen to chronograph changes.
* Changed the Get All APIs to return JSON instead of stringified responses.

### v1.5.5

* Fixed an error when retrieving a transition's duration.

### v1.5.4

* Added inactive chronographs to app settings.

### v1.5.3

* Duration Flow cards round results to two decimals or fewer, configurable in app settings.

### v1.5.2

* Fixed an error when retrieving a stopwatch's duration.

### v1.4.11

* Fixed crash reports.

### v1.4.8

* Fixed bugs and made minor description adjustments.

### v1.4.7

* Added `HH:mm:ss`, `mm:ss` and `HH:mm` text tags to duration Flow cards.

### v1.4.5

* Improved German translations.

### v1.4.4

* Improved the SDK3 implementation.

### v1.4.3

* Added Flow cards to retrieve elapsed and remaining durations of timers, stopwatches and transitions.

### v1.4.2

* Added support for Homey Pro (Early 2023).

### v1.4.1

* Documented the 89-second maximum for the delay condition Flow card.

### v1.4.0

* Added wildcard support to chronograph names in running condition Flow cards.

### v1.3.5

* Added Patreon and GitHub Sponsors contribution options.

### v1.3.4

* Fixed controls in app settings.

### v1.3.2

* Corrected hints for timer and transition adjustment Flow cards.

### v1.2.3

* Added a source code link.

### v1.2.2

* Fixed existing issues.

### v1.2.1

* Fixed an SDK3 bug.

### v1.2.0

* Rewrote the app for SDK3.

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
