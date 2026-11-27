# Changelog

## 1.1.0

### Minor Changes

- 2b674c6: Implement the plugin: ` ```leaflet ` code blocks written for Obsidian Leaflet render as interactive Leaflet maps — image maps (one or several vault images, `[[wikilink]]` form too) and real-world maps (OpenStreetMap tiles by default, extra `tileServer`s), with `lat`/`long`, size, zoom, `unit`/`scale`, `darkMode` and `marker:` lines (links open their note). Leaflet is shipped with the site and loaded only on pages with a map; maps survive SPA navigation and work under a base path. Removes the plugin template's example transformer, filter, emitter and component, which the previous releases applied to every site that enabled the plugin. Requires Quartz 5.1 or later.

## 1.0.1

### Patch Changes

- 7e13a66: Declare the Quartz peer dependency as `^5.0.0` (was `^4.5.2`), matching `quartz.quartzVersion` (`>=5.0.0`). This plugin is a Quartz v5 plugin; the old range made npm report a peer conflict against Quartz 5.

## 1.0.0

### Major Changes

- Stable 1.0 release. All `@quartz-community/*` dependencies now use `^1.0.0` ranges.

  Pre-1.0 caret ranges pinned the minor version (`^0.2.1` means `>=0.2.1 <0.3.0`), so
  published fixes to shared packages could never be resolved by dependents. Moving the
  ecosystem to 1.0 makes caret ranges behave conventionally.

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Initial Quartz community plugin template.
