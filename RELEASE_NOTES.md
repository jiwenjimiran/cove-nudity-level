# Nudity Level v1.0.0

- Video and image filters with multiple exact levels: Unknown, None, Low, Medium, High, Full.
- 37 preconfigured body-model tags, including Pussy Hair as Medium.
- Pussy + Nipples and Asshole + Nipples produce Full; Balls and Dick produce Full independently.
- Settings with explanatory rules, draggable tag buckets, accessible movement controls, full-library tag search, and editable Full combinations.
- AI-first classification with manual fallback, saved filters, and filtering before pagination.
- Requires Cove 1.5.1 or newer. Use as a top-level filter; advanced condition groups are not supported in this release.

Validation: 98 backend checks, four frontend tests, responsive browser interactions, and ZIP loading through Cove's isolated extension loader. PostgreSQL validation checks translation; execution fixtures use SQLite.

Install the attached ZIP through Cove's Settings → Extensions → Install from ZIP, or use the direct asset URL in Install from URL. Enable the extension and refresh Cove once. The attached `.sha256` file contains the package checksum.
