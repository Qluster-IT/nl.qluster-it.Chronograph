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

## Widget style designer

The Widgets tab in app settings lets you create and copy independent named
design styles and color schemes. Switch between the two editing modes and
choose the other collection in Design preview to see any combination. In color
mode all elements can be selected, including unused elements.
Existing custom styles are split into a design and matching color scheme; save
the settings to persist this migration. Deleting a design does not delete its
scheme, or vice versa.
Each widget uses the built-in Default design and color scheme whenever its
corresponding selector is empty. A saved design or scheme can be selected
independently; choosing one does not change the other. The Default color scheme
also takes precedence over color settings retained from older widget versions.
The built-in Ocean, Forest, Sunset, Twilight, Blossom, Sky and Amber color
schemes offer alternative accents and progress-bar colors; select them in the
designer or in a widget's color scheme setting. Built-in color schemes are
read-only; copy one to create a customizable scheme.
Widget design and color-scheme selectors show a built-in or custom description
beside each choice and list built-in choices first, with Default at the top.
The designer's dropdowns also keep Default first and sort the remaining
built-in and custom choices by their displayed names within each group.
The Centered, Dashboard, Focus and Vertical designs provide alternative layouts; copy
one to customize it. Centered places the duration between the action columns in
Normal and Large sizes, Dashboard places
the status beside the name and the duration on its own row in Normal and
Large sizes, Focus emphasizes the duration, and Vertical stacks content. In
Compact size, Vertical places the status bar alongside the content across rows.
The light and dark widget picker previews are abstract, text-free illustrations
of the Default design. On Windows, regenerate them with
`.\tools\development\generate-widget-previews.ps1`.
On Homey, built-in designs and color schemes are read-only, including Default. Copy one
to create an editable custom design or scheme. The preview controls remain
interactive for testing without changing the saved design, while editing-only
fields are hidden for read-only presets. Choose a widget type, size and state
for the design preview. Confirming deletion removes a custom item immediately
without saving other pending edits. Built-in designs and schemes cannot be deleted. Select an item before dragging it. Drag a row label
to reorder rows, or the top of a column to reorder columns within its row. Reordering applies to the selected
size, moving the associated settings and element positions in every state;
other sizes are unchanged. Arrange elements in rows and groups by dragging
them, including reordering within a column. A line and label mark the insertion
position relative to nearby elements;
the Unused row is highlighted when targeted. On touchscreens a floating label follows the dragged element until it
is dropped. Elements in a column are arranged horizontally without wrapping by
default; select a column to arrange them vertically instead. Text may be
truncated in a narrow column. Start and Play / Resume are separate elements with independently
configurable positions and colors. Compact, Normal and Large have separate layouts, shared across the
three widget types. Move an element to the Unused row to remove it from the
layout; drag it back to a group to restore it. Unused elements
are specific to the selected size and base layout or state override. Existing
state-specific positions still override changes to the base layout in other
states. When a base move would otherwise be hidden by an override in the
selected preview state, that state's position is updated as well.
Select an element to set an optional size override (4–100 px) for the selected
design and widget size. Text and icons use font size, buttons and fields use
height, and the status bar uses thickness. The app default is shown next to the
input; leave it empty to use that default. The design-wide
shrink option controls whether duration text and Large action buttons shrink on
widgets narrower than 300 px. It is enabled for existing designs by default.
Select Start fields to set the number of input rows independently for timers
(1–2) and transitions (1–5) for each design size. The app defaults are one
timer row and two transition rows. The chosen row count stays fixed as the
widget width changes, so very narrow fields may truncate their contents.
Under Design, Height applies to the selected preview size and is configured
separately for each size. Auto follows the current content.
Minimum including input fields reserves space for the tallest preview state,
including the start form. Minimum excluding input fields reserves space for
inactive, paused and running states without input fields; the widget can grow
when the input form is displayed. Measurements use the available width in both
the designer preview and dashboard widgets.
The Default style uses Minimum excluding input fields for Compact and Minimum including input fields for Normal
and Large, with row 3 aligned to the bottom in Normal and Large.
Select a row to align it at the top, middle, or bottom of available vertical
space. This is most noticeable with Minimum required height when another row
is hidden. Rows remain in order; when multiple rows request extra space, they
share it rather than overlapping.
Select a column to span additional rows for the selected size. The editor shows
the column extending across the affected rows. Hidden rows
collapse, and columns in the affected rows fit into the remaining width.
The four column-span units are shared with columns spanning from earlier rows.
Changing spans or row order automatically adjusts affected rows; if there is
not enough room, extra columns are merged into the last remaining column.
Spanning columns fit their content; other columns can also use fit-to-content
width. Moving a row clips its spans to the remaining rows.
Each row also has top padding from 0 to 100 px, configured independently for
each widget size. Padding adds to the normal row spacing and moves with the row.
The preview displays positions from the layout currently being edited: base
positions in base mode, or resolved positions in state-override mode. Row
visibility and element visibility still follow the selected preview state.
Changing the preview type preserves the selected size and state, including an
open start-form state when temporarily viewing a stopwatch, which has no start form.
Every non-button element has one Color setting. Buttons have separate
Background and Text / icon color settings, including Cancel. In Not running,
a selected color is the base color inherited by other states unless overridden.
Theme color follows Homey's theme; automatic button text/icon color preserves
the existing button appearance.
Select a row to configure its visibility separately per size: choose any
combination of inactive, paused, running and start form open. An optional
duration closes the start form and returns to inactive; the earliest duration
among visible rows applies. The Compact Default's start form closes after ten
seconds. Start and Cancel also close the form, and Play can reopen it.
Existing action rules are converted to the closest state: Play to start form
open, Pause to paused, and Stop to inactive. A timed Play becomes a start form
timeout; toggle and other action-specific behavior cannot be preserved exactly.
Start fields are shown only when the chronograph is inactive or its start form
is open; resuming a paused chronograph does not show them.
Existing styles retain their previous start-field behavior until the relevant
row is configured.
The grouped designer has five rows. Each row can have one to four columns (groups), configured independently per
size. Reducing the count moves elements from removed columns into the last
remaining column, including their state-specific positions. The preview keeps
empty columns in place; start fields wrap within their assigned column.
In the Large preview, the chronograph icon is larger, and start fields are
taller and use larger text to match the larger action buttons.
The Default design places the Status bar in row 2 for Compact and row 5 for
Normal and Large, visible when running or paused. It can be placed in any
row for timers and transitions. Each size can configure its background and fill colors in the
color scheme, and its direction, timer fill/empty mode, and optional transition
step markers in the design. The
designer shows sample progress (25% elapsed); markers use the preview step count
when it is between 2 and 100, otherwise five example steps. Widgets use the
active transition's actual step count and show markers for counts from 2 to 100.
The Compact status bar is thinner than Normal and Large. The bar is not shown
for stopwatches.
Select a column to set its span, from one to four units. Every row has four
units in total. Reducing a span adds empty one-unit columns at the end of the
row without changing existing columns. Increasing a span takes space from the
nearest columns on the right first, then on the left. If a larger span
cannot fit, adjacent columns are removed from right to left around the selected
column. Elements to its right shift into the next available column, cascading
until the last column, where overflow is combined. Elements from removed columns
to its left move into the selected column. This applies to every state.
The selected column remains selected even if its number changes. When columns are
removed their space joins the last remaining column; new columns take one unit
from the rightmost column with space to spare. Spans are saved per size and
shared across preview states.
Each column also has left, center, right or stretch alignment. Stretch fills the
column width for vertically arranged elements, or shares the width equally
among horizontally arranged elements. Direction and alignment
are configured per size and shared across states. Existing and newly added
columns default to horizontal and left alignment. When columns are removed,
surviving columns retain their settings and moved elements use the destination
column's settings. Vertical alignment can be top, middle or bottom within the
row; existing and new columns default to middle.
Column width can either use its span as a share of the remaining row width, or
fit its content. Content-sized columns take their natural width where space
permits; span-sized columns divide the remaining space in proportion to their
spans. Compact Default's first row uses three columns: a two-unit flexible column for icon,
name and status, followed by content-sized duration and button columns. Its
second row has two span-sized columns for start fields and Start / Cancel,
with spans of three and one respectively. Normal and Large Default have a
single column in their first two rows. Their duration and start rows each have
a flexible first column and a content-sized second column; Start aligns to
the bottom of the start row, and Cancel is unused. Existing
saved styles without width settings retain span-based sizing.
The Default style defines row visibility for each size: in Normal and Large,
the start row is shown while inactive and the duration/action row while paused
or running. In Compact, the start-form row appears after Play.
Select an element to edit its position and color, or select Widget above the
designer to edit the background color. Row, element and background settings are shown
only for the current selection; selecting a column shows its span instead.
The preview buttons simulate starting, pausing, resuming and stopping, and the
start fields accept sample input. These controls do not operate real chronographs
or save the sample values. If a visibility rule hides the controls, use the
status selector to reset the preview.

Each size has a base layout. State-specific positions override only the
elements explicitly changed; other elements continue to follow the base.
Start form layouts inherit the inactive layout before applying their own
positions for any size.
Existing cell-based styles remain available and can be converted
to grouped layouts using the editor. Existing grouped styles initially place
Start where Play was placed and copy its colors; subsequent edits are independent.
Colors are shared across sizes. Set the
default element and background colors in the inactive state. Paused and running
states inherit these colors unless individually overridden. The compact start
form also inherits inactive colors unless overridden. Choose Inherit to remove
an individual override; its label shows the inherited color. The Default style
sets a blue running duration as an explicit override. Existing saved colors are
preserved. Use the settings Save button to persist custom styles.

The designer currently stores styles for later use; it does not yet apply them
to dashboard widgets. Existing widget settings and appearances are unchanged.

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

**Simple math expressions**

The start, resume and adjust action cards have built-in support for simple math expressions. This allows
for random or computed timer and stopwatch durations, including calculations based on token values.

For example:

```javascript
ceil(99.5) / 5
pick(1, 3, 5, 9) * 2
random(10, 30)
abs(-10)
```

In addition to basic math expressions, the following functions are supported:

* abs(x) - calculate the absolute value of a number,
* ceil(x) - rounds a number up to the next whole number,
* floor(x) - rounds a number down to the previous whole number,
* round(x) - rounds a number towards the nearest whole number,
* random(min, max) - a random number larger or equal to min and smaller than max,
* min(x, y) - the lowest number from the supplied list,
* max(x, y) - the largest number from the supplied list,
* pick(x, y[, n]) - pick a random value from the supplied list.

**HomeyScript**

In addition to the available flow cards, timers and stopwatches can also be controlled using [HomeyScript](https://homeyscript.homey.app).
For example, this script will stop all running timers:

```javascript
let app = await Homey.apps.getApp({id:'nl.fellownet.chronograph'});
app.apiGet('/timers').then(result => {
	let timers = JSON.parse(result);
	timers.forEach(timer => {
		app.apiDelete('/timers/' + timer.id);
	});
});
```

* GET /timers - retrieve a list of all active timers,
* GET /timers/:id - retrieve a single timer,
* PUT /timers/:id - pause or resume a timer,
* DELETE /timers/:id - stops a timer.
* GET /stopwatches - retrieve a list of all active timers,
* GET /stopwatches/:id - retrieve a single timer,
* PUT /stopwatches/:id - pause or resume a timer,
* DELETE /stopwatches/:id - stops a timer.
* GET /transitions - retrieve a list of all active transitions,
* GET /transitions/:id - retrieve a single transition,
* PUT /transitions/:id - pause or resume a transition,
* DELETE /transitions/:id - stops a transition.

## Contributing

To submit a bug report or feature request, please create an [issue at GitHub](https://github.com/fellownet/chronograph/issues/new).

If you'd like to contribute code to this project, please read the
[CONTRIBUTING.md](https://github.com/fellownet/chronograph/blob/master/CONTRIBUTING.md) document.

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
