# Project guidance

## Homey app changes

- Follow the existing Homey SDK 3 and Homey Compose conventions. Treat `.homeycompose/` as the source for composed app configuration.
- Add or change translations in `.homeycompose/locales/`; settings keys belong in `<language>.settings.json`. Keep the committed root `locales/<language>.json` files as empty objects; Homey Compose fills them when building.
- In Dutch, translate the Chronograph type "transition" as "transitie" (plural "transities"), not "overgang" or "overgangen".
- Do not mention deprecated devices or Flow cards in user-facing documentation.
- Keep changes focused, preserve existing app behavior, and update directly related documentation and tests.
- Run the relevant tests with `npm test`.
- Never put development-only tools or dependencies in the app's root `node_modules/`. Keep them under `tools/`, since some Homey apps must include their root `node_modules/` in the app package.
- Homey widgets require app compatibility `>=12.3.0` and are not supported on Homey Cloud. When implementing widget support, make the compatibility change as part of the complete feature, and call out this support change.

## Settings screens

- Add the `hy-nostyle` class to buttons in settings screens.

## Documentation

- Do not document widget-scoped APIs in docs, Wiki pages, or README files; they are only accessible from Chronograph widgets.

## Chronograph widget

- Preserve published widget IDs, setting IDs, setting values, and existing dashboard configurations unless the user explicitly authorizes a breaking change.
- The widget should let a user select a timer, stopwatch, or transition and provide controls to pause, resume, and stop the selected chronograph.
- Use AngularJS (AngularJS 1.x) for the widget if it is compatible with Homey's widget environment. Keep the shared library in the app-level `assets/js/` directory and load it as a local asset; do not rely on a third-party CDN.
- Use the widget-scoped API for widget operations and follow the existing Chronograph APIs and lifecycle behavior. Do not expose unrelated app functionality.
- Do not request or store Homey account credentials, tokens, or other secrets in the repository. The app owner performs any Homey account sign-in and device installation needed for manual testing.
