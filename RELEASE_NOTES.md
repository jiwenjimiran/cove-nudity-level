# Nudity Level v1.1.0

- Expand defaults to 155 unique tags across body, positions, actions, and BDSM models. Sex acts and sexual positions produce Full without body detections.
- Respect the requested proxies: Upskirt/Undressing/Sucking Toy-Dildo are Medium; Cum on Person/Cum Swapping are High; Catheter is Full.
- Generic poses, camera/count tags, and non-specific bondage tags alone remain Unknown.
- Fix settings visibility on Settings → Extensions → Installed; keep the dedicated Nudity Level tab too.
- Add multiple named compound rules targeting any level from None to Full, with AND groups containing OR tag choices.
- Preserve the original Pussy/Asshole + Nipples Full rule and Pussy Hair exception. Highest individual or matching-rule result wins.
- Automatically migrate v1 settings and append new defaults once without overwriting existing edits or resurrecting removals.
- Requires Cove 1.5.1 or newer. Use as a top-level filter; advanced condition groups are not supported in this release.

Validation: backend classification/migration/query checks, five frontend tests, and browser checks using Cove's actual settings selection/rendering code and component registry. The old visibility bug is reproduced and both fixed entry points are verified. ZIP loading is checked through Cove's isolated extension loader. PostgreSQL checks translation; execution fixtures use SQLite.

Install the attached ZIP through Cove's Settings → Extensions → Install from ZIP, or use the direct asset URL in Install from URL. Enable the extension and refresh Cove once. The attached `.sha256` file contains the package checksum.
