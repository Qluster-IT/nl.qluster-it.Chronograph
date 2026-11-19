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
* Choose the WidgetKeeper design, or customize padding, outlines, HEX colors and gradient backgrounds in the designer.
* Group multi-widget tiles into shared rows or individual cards with three spacing options, and preview them in light or dark mode.
* Import, export and share designs and themes through Templates and the community Widget Exchange, with timer previews and zoomable images.
* Share template posts with six preview images: stopwatches, timers and transitions in light mode, then dark mode.
* Display elapsed and total time for timers and transitions, with optional reversed time displays.
* Set a timer or transition widget's default duration to 0 to use the last duration saved by a Flow or API start, if available.
* Transition widget default start, end and step values use the last saved Flow or API values when set to 0 or left empty.
* A Flow resume card also saves these values when it starts a chronograph that is not already active; resuming an existing one leaves them unchanged.

## User manual

See the [Chronograph wiki](https://github.com/Qluster-IT/nl.qluster-it.Chronograph/wiki) for usage, widgets, the designer, and the API reference.

## Development

Widget typography is shared between native widgets and designer/template previews
through `assets/css/chronograph-typography.css`. Keep appearance-critical styles
explicit rather than inheriting Homey or Bootstrap defaults. Widget controls use
`hy-nostyle` so Homey's form styles do not override the selected design. This
applies to built-in and custom designs automatically, without rewriting saved
sizes, line heights, button shapes, or theme colors.

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

Settings navigation and template action buttons use locally bundled icons with
translated text labels. Widgets and Designs share a local inline SVG;
decorative icons are hidden from assistive technology.
Inactive settings tabs use Homey's monochrome text color; the selected tab
retains Chronograph's accent.

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
theme. All column counts support separation and line-color previews.
Widget-style rows give each row a shared card; Widget-style cards give every
chronograph its own card, respecting column spans. Both offer normal (16px),
small (12px, matching WidgetKeeper Lights) and tiny (8px) gaps. Individual cards
use the selected gap horizontally and vertically; row cards use it between rows.
Multi-preview tiles in a row share a frame height without stretching their
internal layouts to match their neighbors, as in the live widget.
The multi-widget line-color selector includes every named designer color,
including Black (light/dark); HEX remains a designer-only choice.
Preview spacing is scoped to the widget's 4px space-unit scale, independent of
Homey's settings-page tokens. The complete sticky preview, including its Size
selector, is capped at 40% of the viewport height; taller previews scroll inside
that panel without shrinking the widget layout or covering the element editor.
The real multi-widget paints its background on the rounded outer container,
not the iframe body; row/card separation keeps transparent gaps between frames.
Default surfaces use Homey's background color in light mode and near-black
`#181920` with a subtle light inset rim in dark mode. Shared surface CSS keeps live
widgets and designer previews consistent; explicitly selected
background colors, including pure black, are unchanged.
The default and line-separated layouts have an outer card shadow in light mode,
with a small transparent gutter to keep it visible inside the widget viewport;
the dark-mode rim replaces that shadow. Both Widget-style rows and Widget-style cards
apply this treatment to their own frames, preserving transparent gaps. Single widgets use Homey's native
frame with the same default surface and dark rim inside it.
Blue, green, orange, red and fixed white color choices use Homey's semantic palette
variables. Grey uses Homey's theme-aware monochrome palette. Black remains fixed
black; yellow, purple, teal, cyan, indigo, pink and brown are Chronograph extensions.
Existing saved color IDs remain valid. Preview colors use the same Homey tokens.
Selecting Widget in a custom design exposes a border width per size.
Homey default preserves the standard frame; explicit 0 removes the app-drawn
outline and frame rim/shadow, while 1–20px adds an outline. Built-in designs and
previously saved zero widths retain their existing Homey frame. A shared
multi-widget frame becomes borderless only when every design in that frame
requests it. Widget-style rows evaluate this per row; Widget-style cards use
each tile's own design. In Themes, selecting
Widget exposes its border color, including per-state overrides; Default uses
`--homey-line-color`. The optional outline is drawn inside Homey's native frame,
whose shadow cannot be restyled through the widget API. Widths and colors survive
template export/import. App-drawn runtime cards use `--homey-border-radius-default`.
Single-widget previews and all visible multi-widget preview frames (shared,
per-row, or per-card) emulate the dashboard's 10px corners instead of inheriting
the settings page's radius. Native widget frames are unchanged.
Designer and template previews draw the optional outline inside the Homey frame,
preserving its outer padding just like live widgets.
Widget options also provide independent top/right/bottom/left padding overrides
per size; Homey default leaves native padding untouched. Multi-widgets use the
largest requested padding on each side of the shared frame or row. With individual
cards, each tile uses its own padding. Row column gaps, column element gaps and text
line-height overrides are reusable designer controls; absent options keep the
existing defaults. WidgetKeeper Large uses these controls for a 36px icon beside
a stacked Name and Status header, without design-specific CSS.
Every designer color selector offers HEX with a validated `#RRGGBB` input and
native color picker. The **Black (light/dark)** option keeps the existing `black-light`
palette ID and remains distinct from pure **Black**. Theme background fills can
be solid or a top-to-bottom tinted gradient per state, inheriting the base fill
unless overridden. The matching WidgetKeeper
theme applies a blue gradient only while running. These settings survive saving
and TWF export/import; choosing a design does not replace the selected theme.
Switching between Designs and Themes keeps the selected Widget or element only
if it can be selected in both modes. Choosing or deleting a design or theme
clears the editor selection and preview highlight.
App default means the element's normal appearance, not a global theme accent.
State color overrides consistently show Inherit (Not running), naming the source
state rather than its current color.
The Theme state selector explains that Not running sets each element's base
color, Inherit reuses it in other states, and App default leaves it automatic.
Grouped preview buttons use the same block flex layout as live controls, avoiding
extra text-baseline space around small buttons and their selection outlines.
The designer preview shows its full contents until it pins over the settings
tabs while editing; the pinned preview can scroll within 45% of the viewport.
Preview Start and Play actions both open hidden timer/transition input rows before
starting; stopwatches start immediately and paused chronographs resume without input.
Button text can be customized per design size. Default text is translated;
the default appears as a placeholder in the designer. Custom text is shared
across languages, and empty custom text shows only the icon.
Icon, duration, elapsed duration, total time and status bar elements can reserve space when hidden, separately
for each design size. Built-in designs reserve icon space by default. Icons are
centered in a square using the configured icon size.
Hidden rows do not reserve elements, padding or gaps in the current layout.
Minimum-height modes still measure other visible states to keep the card height stable.
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
Shared previews match the widgets' size-specific text line heights, including custom
text sizes and duration spacing when shrinking on narrow widgets.
Settings preview widgets are capped at 450px wide and fit smaller screens. Template
images use a fixed 350px capture width per widget, independent of the screen width.
Preview frames follow live Homey padding (normally 16px), including design overrides.
The built-in WidgetKeeper design matches Device Values' Pill tiles, Light Controls and
standard Thermostat Presets card heights (52px, 88px and 156px) in Compact,
Normal and Large, with 14px, 14px and 17px names respectively. Start forms may
expand beyond those heights rather than clipping their inputs.
Compact uses balanced vertical padding (7px top and bottom), a stacked
name/status column, and vertically centered 32px controls.
Large aligns its start-field row to the bottom of the available content area.
This preset uses existing designer controls for element sizes, placement, reserved
space, row padding and height modes; duplicate it to customize those settings.
Existing built-in designs and shared widget defaults are unchanged by this preset.
The designer's Light/Dark preview selector starts with the browser's color scheme
and follows browser color-scheme changes, without changing saved designs or themes.
The local development preview defaults to Light to match its light settings page;
Dark remains selectable without changing saved designs.
Each copied forum post includes six separate PNGs: stopwatches, timers and
transitions in light mode first, then the same three in dark mode. Each has a
3-by-3 grid of sizes and states, preserving the template's chosen colors.
Copied forum posts leave an empty, normal paragraph below the title for an optional
description; the export instructions point users to it without adding placeholder text.
Creating a TWF starts the rich clipboard write on the click and supplies the
images after rendering. A progress overlay blocks interaction during encoding
and rendering. If copying is blocked, the bold retry message points to
**Copy post and images** without requiring another render.
TWF exports and imports use the compressed v1 format, starting with
`[twf:Chronograph:Chronographs:`. All chronograph widget variants share this
family; other apps and widget families are rejected. Unreleased prototype
encodings are not supported.
Automatic copying requires a secure context and clipboard permission in the
settings frame. HTTPS fixes the insecure HTTP case, but the Homey web frame
can still block automatic copying. In either case, click **Copy post and images**
after generation to copy the text and all six PNGs without rendering again.
**Post on Forum** becomes available once the full post has been copied. The
separate **Topic** button opens the Widget Exchange discussion directly.
The community catalogue remembers its sort order (Newest, Oldest, Name, Likes
or Favorites). When list previews are enabled, it renders one normal-size
running timer from each decoded template. Expanding an entry replaces only its
live preview with details and forum images; other entries retain their previews.
Clicking an image opens a scrollable
zoom viewer filling the settings viewport, with touch-sized controls and the
full-resolution forum upload when available, preserving the image's original
colors in light and dark settings. Two-finger pinching zooms around
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
hook when Git hooks are available. The hook runs Mocha directly with compact
output and uses the same full-suite configuration as `npm test`. Development dependencies stay under
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

### v3.1.0

* The Widget Exchange remembers its sort order and shows expanded template details and images in place of live previews. The image viewer supports Ctrl+scroll zoom and mouse-drag panning.

### v3.0.11

* Improved selection and preview behavior in the widget designer.

### v3.0.10

* Dashboard widgets now more closely match the designer preview for both built-in and custom designs and themes.

### v3.0.9

* Fixed TWF sharing and imports to recognize templates for Chronograph widgets and show clearer messages for incompatible templates.

### v3.0.8

* Added WidgetKeeper and Transitions designs, plus more ways to customize widget spacing, outlines, and colors.
* Group multi-widget tiles into Widget-style rows or individual cards with Tiny, Small, or Normal spacing.
* Widget previews look more like dashboard cards and are easier to use on small screens.
* Timers and transitions can show elapsed and total time, with an option to reverse the time display.
* TWF exports show progress and include light and dark preview images. If automatic copying is blocked, copy the post and images manually before opening the forum. The community button is now **Topic**.

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
