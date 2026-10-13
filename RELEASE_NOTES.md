# Nudity Level v1.2.0

- Replace bucket columns with full-width, collapsible rows and compact tag chips.
- Add × removal controls and remove every per-tag dropdown.
- Chips follow the pointer during mouse/touch dragging; destination rows highlight and accept drops while collapsed. Escape cancels a drag.
- Add Collapse all / Expand all and retain keyboard movement with Alt + Up/Down.
- Rebuild compound rules as compact condition-to-result summaries. Edit opens a focused WHEN / AND / THEN flow, with chip alternatives and tag pickers shown only when requested.
- Preserve classification, the 155 defaults, stored schema, and saved customizations.
- Requires Cove 1.5.1 or newer. Use as a top-level filter; advanced condition groups are not supported in this release.

Validation: five frontend tests and browser checks using Cove's actual settings rendering and component registry. Checks cover full-width rows, collapsed-target mouse/touch drops, live drag previews, cancellation, × removal, rule creation/persistence, both settings entry points, and responsive layouts. ZIP loading is checked through Cove's isolated extension loader.

Install the attached ZIP through Cove's Settings → Extensions → Install from ZIP, or use the direct asset URL in Install from URL. Enable the extension and refresh Cove once. The attached `.sha256` file contains the package checksum.
