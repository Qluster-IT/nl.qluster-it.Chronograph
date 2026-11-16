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
* Control timers, stopwatches and transitions from single or multi-chronograph dashboard widgets.
* Customize widget layouts, themes and per-type default icons, with optional widget-specific Font Awesome Free icons or None.
* Import, export and share designs and themes through Templates and the community Widget Exchange, with timer previews and zoomable images.
* Display elapsed and total time for timers and transitions, with optional reversed time displays.
* Set a timer or transition widget's default duration to 0 to use the last duration saved by a Flow or API start, if available.
* Transition widget default start, end and step values use the last saved Flow or API values when set to 0 or left empty.
* A Flow resume card also saves these values when it starts a chronograph that is not already active; resuming an existing one leaves them unchanged.

## User manual

See the [Chronograph wiki](https://github.com/Qluster-IT/nl.qluster-it.Chronograph/wiki) for usage, widgets, the designer, and the API reference.

## Development

### Flow card structure

Timer, stopwatch and transition trigger modules share matching, dispatch and
argument-storage helpers in `lib/flow-cards.js`. The individual modules retain
their published card IDs, tokens and settings keys. Trigger and argument-storage
failures are logged through Homey.

Configured names are rebuilt from literal saved Flow names and explicit picker
selections, preserving last start values for those identities. BLL coding and
Homey tags/tokens in typed names are evaluated only during Flow execution, never
to populate configuration. Wildcards are matching rules, not configured names.
Runtime-only instances remain visible while running or paused, with the exact
name resolved at creation; later expression or token changes do not rename them.
They disappear after stopping or finishing and never create configured entries
unless a saved Flow also references that exact name literally.
Startup removes previously cached dynamic names without discarding active
snapshots awaiting restoration. Device pairing reads only the configured-name
registry for the selected type, rather than raw Flow arguments or runtime names.
Display-name formatting and device IDs derived from the exact type and name
remain unchanged; existing devices are not removed or re-paired.

`GET /api-ready` returns `{ "ready": true }` only after initial Flow registration,
configured-name collection and snapshot restoration succeed. The app then emits
`api-ready` with the same payload. Clients should subscribe before
probing, check Homey's app availability before each probe, and confirm the
endpoint response rather than relying on an event they may have missed.
Initialization failures remain not ready; failure to deliver the realtime
notification is logged without invalidating the usable readiness endpoint.

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
designs and themes are editable; Save stores a separate browser-only
snapshot under `chronograph-settings-preview:previewBuiltIns`. These changes
survive reloads but do not modify the app defaults or Homey. Share the saved
preview when requesting changes to the actual defaults. Chronographs are
sample data and reset when the page reloads. The preview does not load Homey's actual stylesheet or connect to a
Homey device, so final appearance and behavior still require a Homey check.
The designer can also preview three independently selectable chronograph types
in a one-, two-, or three-column multi-widget; tile width depends on the
available preview space. All tiles share the selected design, size, state and
theme. For one or two columns, preview the widget's row separation
and line color as well.
The real multi-widget paints its background on the rounded outer container,
not the iframe body; card separation keeps its transparent gaps and rounded rows.
Preview Start and Play actions both open hidden timer/transition input rows before
starting; stopwatches start immediately and paused chronographs resume without input.
Button text can be customized per design size. Default text is translated;
the default appears as a placeholder in the designer. Custom text is shared
across languages, and empty custom text shows only the icon.
Icon, duration, elapsed duration, total time and status bar elements can reserve space when hidden, separately
for each design size. Built-in designs reserve icon space by default. Icons are
centered in a square using the configured icon size.
Duration counts down for timers and transitions. The optional Elapsed duration
element counts up and retains the internal `remaining` ID for saved designs and
template compatibility. Reverse time display swaps both values, independently
for each timer/transition widget or tile in a multiple-chronographs widget.
Stopwatches always show elapsed time.
The optional Total time element shows the configured duration for timers and
transitions, independent of time reversal. It starts in Unused when loading
older designs. The built-in Transitions design extends Default with every
element placed in Normal and Large, including an extra elapsed/total time row;
Compact remains identical to Default. Elements retain their usual state visibility.
Designs store separate default icon references for timers, stopwatches and transitions.
Single and multi-widget tiles use these defaults unless an explicit widget icon
(including None) overrides them. Templates preserve references only, never icon files.
Template previews and exported preview images use the same icons; image capture embeds
only the bundled font styles needed by the selected design.
The community catalogue renders one normal-size running timer from each decoded
template when list previews are enabled, caching that preview for the loaded entry.
Expanded entries retain the forum images; clicking an image opens a scrollable
zoom viewer filling the settings viewport, with touch-sized controls and the
full-resolution forum upload when available. Two-finger pinching zooms around
the fingers' midpoint; one-finger scrolling and the zoom buttons remain available.
Custom names must be unique within designs and within themes, ignoring case and
surrounding spaces; built-in names may be reused.
Layouts can be copied between sizes without replacing other size-specific
settings. Undo and redo apply to the currently selected design or theme.
Switching away from an unsaved design or theme, including to another tab or
Templates, prompts to discard its changes. External links open without
discarding editor changes; the browser may warn before closing or reloading
with unsaved settings. Widgets and General have separate save controls;
General saves only general settings and has no undo/redo controls.
The preview highlights the selected widget, row, column or visible element.
The Theme editor shares the grouped designer for selecting elements, including
unused elements, without changing the design layout. Size and the preview stay
visible together while scrolling in either editor; tall previews scroll within
the sticky panel.
Nothing is selected initially; tap or click the selected item again to deselect it.
Press Ctrl+C in the terminal to stop the server. Set
`CHRONOGRAPH_PREVIEW_PORT` before starting it to use another port.

On Windows, regenerate the widget picker previews with
`.\tools\development\generate-widget-previews.ps1`.

After changing widget scripts, styles, or the shared design template, run
`npm run build:widget-assets` and commit the generated bundles. Tests check
that the bundles match their sources.
The development build minifies app-owned JavaScript and CSS; already-minified
Angular and Font Awesome assets, including their licences, remain unchanged.

Startup loads appearance and chronograph state concurrently, displaying each
tile only after both are available. Mixed built-in/custom tiles share one initial
state batch. Running snapshots retain their receipt time so appearance loading
does not delay the displayed clock.

Widget tiles share custom appearance loading within each widget frame and cache
design geometry until the design, size, or icon availability changes. Keep live
time and progress bindings dynamic. Minimum-height sizing omits only duplicate
state/layout measurement layers; all distinct sizing scenarios remain covered.
Presentation styles are cached per design, theme, size and state, and transition
markers are reused until their step count changes.

The Page Visibility API suspends display clocks, polling and realtime-triggered
fetches while the widget document is hidden. Initial loading still completes;
returning to the foreground immediately refreshes state (one batch for a multi
widget). Visible update rates and the chronographs running on Homey are unchanged.

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

Template preview images use html-to-image; its license is in `assets/licenses/html-to-image-LICENSE.txt`.

To regenerate the widget icon previews after updating the icon catalog, run `npm ci --prefix tools/icon-previews` followed by `npm run generate:icon-previews`. The generator and its dependencies are excluded from the Homey app; the generated preview catalog remains in `assets/`.

Application image by [Agê Barros](https://unsplash.com/@agebarros?utm_source=unsplash&utm_medium=referral&utm_content=creditCopyText) on [Unsplash](https://unsplash.com/search/photos/time?utm_source=unsplash&utm_medium=referral&utm_content=creditCopyText).

## Changelog

### Unreleased

* Allow black and white for widget and button backgrounds, as well as text and borders, in themes.
* Apply matching time typography, custom sizing, and narrow-widget behavior to Total time in widgets and Designer previews.
* Fix Cancel button background colors bleeding onto the surrounding layout in Designer previews.
* Add a built-in Transitions design with all elements placed in Normal and Large, based on Default.
* Correct French timer action labels to distinguish timers from stopwatches consistently.
* Add an optional Total time element for timer and transition widget designs, unused by default.

* Add an optional Elapsed duration element for timers and transitions to widget designs.
* Show remaining duration by default for transitions, like timers, with a reverse-time option per widget or multiple-widget tile that swaps remaining and elapsed displays.
* Share saved custom widget designs and themes as compact templates, with a visual import review.
* Use Templates for design and theme import/export; remove the separate JSON-file controls.
* Copy a template forum post with three size-and-state preview grids for timers, stopwatches and transitions.
* Renamed widget color scheme settings to themes; existing dashboard settings require migration.

### v3.0.5

* Start with no designer selection and tap or click the selected item again to deselect it.
* Export custom designs and themes; built-in items can be copied first.

### v3.0.4

* Added per-design and per-theme undo/redo and unsaved-change protection.
* Export and import custom widget designs and themes as JSON files.
* Added layout copying between design sizes and a three-tile multi-widget preview.
* Added a link to the widget designer guide.
* Configure the number of rows per design size, and customize button shapes and borders.
* Added a Settings design and matching theme.
* Show field labels on focus and highlight selected designer items in the preview.
* Preview multi-widget row separation and line colors.
* Fixed a false discard warning when migrating older local preview presets.
* Updated Better Logic Library to 1.0.3.
* Customize widget button text separately for each design size.
* Reserve space for hidden duration and status bar elements to keep widget layouts aligned.
* Refined the built-in widget designs.
* Combined the widget and API migration announcements into one notification.

### v3.0.3

* Prevented retries of the API migration notification after a delivery failure.

### v3.0.2

* Added a one-time notification introducing dashboard widgets and the app settings designer.

### v3.0.1

* Added a designer preview for one-, two-, and three-column multi-widget layouts.

### v3.0.0

* Added a multi-Chronograph widget with individually configurable tiles and up to three columns.
* Create custom widget layouts and themes with the widget designer.
* Improved translations.
* Improved app and widget performance and reduced resource usage.
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
