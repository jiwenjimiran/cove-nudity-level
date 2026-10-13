# Cove Nudity Level

Filter videos and images by **Unknown, None, Low, Medium, High, or Full**, using configurable AI-first body-tag rules. Requires **Cove 1.5.1 or newer**.

## Install

In **Settings → Extensions → Install from URL**, paste:

```text
https://github.com/jiwenjimiran/cove-nudity-level/releases/download/v1.0.0/io.github.jiwenjimiran.nudity-level-1.0.0.zip
```

Alternatively, download the ZIP from [the latest release](https://github.com/jiwenjimiran/cove-nudity-level/releases/latest) and use **Install from ZIP**. Enable the extension and refresh Cove once.

## Filter

Open **Filters → Nudity level** on a video or image list, including drilldowns. Check any combination of levels to match any selected level. Clear all selections for no restriction. Saved filters retain the selections.

Filtering runs before pagination and preserves native filters, ordering, totals, and drilldown scope. It composes with Filesizes. Use this as a top-level filter on Cove 1.5.1; advanced condition-group placement returns an explanatory error.

## Default rules

**Pussy + Nipples → Full. Asshole + Nipples → Full. Balls or Dick alone → Full.** The combination is evaluated before choosing the highest individual bucket. Other pussy descriptors in High and Anal Gape also qualify with Nipples.

**Pussy Hair is Medium and does not qualify for that combination.** Pussy Hair + Nipples is High.

Videos combine evidence anywhere in the whole item, even at different timestamps or from different people. This describes the item's tags, not a particular person's exposure.

| Bucket | Default tags |
|---|---|
| Neutral | Face, Fingers, Oiled, Wet (Water) |
| Low | Belly Button, Thighs, Feet, Lower Legs, Cum, Tongue, Spit |
| Medium | Ass, Boobs, Pussy Hair |
| High | Asshole, Anal Gape, Nipples, Pussy, Pussy Gape, Pussy Fully Visible, Pussy Closeup, Pussy Very Closeup, Wet Pussy, Very Wet Pussy, Cum on Pussy, Small Labia, Big Labia, Pierced Pussy, Very Hairy Pussy, Innie, Medium Labia, Spread Labia, Pink Pussy, Brown Pussy, Shaved Pussy |
| Full | Balls, Dick |

Neutral is an internal contribution, not a seventh filter option. Without a Full match, the highest non-neutral bucket wins. **None** means usable analysis with no Low-or-higher evidence, or recognized neutral manual tags. **Unknown** means no usable analysis and no configured manual evidence.

## Customize

Open **Settings → Extensions → Nudity Level**. These settings apply to the whole installation.

- Drag a tag to another bucket, or use its bucket dropdown.
- Use **Add tag** in any bucket to search the entire tag database by name or alias. Search is paginated; adding an already assigned database tag moves it rather than duplicating it.
- Remove a tag to stop using it for classification and remove its Full-rule memberships.
- Edit **Full combination rule**: any selected genital-evidence tag plus any selected nipple-evidence tag produces Full. Disable the rule or empty either set to turn the combination off. Tags assigned directly to Full always qualify independently.
- Bucket moves preserve combination memberships, which are displayed on each chip. Uncheck a tag's membership separately if it should stop contributing to the Full combination.
- Use **Save** to apply changes, **Cancel** to discard the draft, or **Restore defaults** to replace the draft with the original 37 assignments. Restoring defaults still requires Save.

Preconfigured tags remain visible when absent from the library. Saving resolves available names/aliases to database IDs so later renames retain the assignment. Deleted custom tags are marked unavailable and do not count; they never silently bind to a replacement ID.

Administrators receive `io.github.jiwenjimiran.nudity-level.settings.write` by default. Other users can view the settings and need that permission to edit. Tag searches require `tags.read`; filtering additionally requires the corresponding media read permission and `airuns.read`.

## Evidence

Configured AI tags from any model take precedence over manual tags. A completed `body_20` run establishes analysis coverage even when it detected no configured tags. Persisted body-model tag applications also establish coverage. Other models establish applicable AI evidence when they produced a configured tag.

If applicable AI evidence exists, matching AI evidence alone determines the level. Otherwise, configured manual (`user`/`manual`) tag applications provide the fallback. Scraper evidence is excluded, as are AI applications tied to failed, cancelled, pending, or running runs. Source keys `ext:ai.*` and `ai:*` identify supported AI evidence.

The extension reads existing persisted detections; it introduces no confidence/duration threshold, performs no inference, and writes no library tags. Changing settings affects subsequent filter requests without a rescan. Classification is computed on demand in batches; no materialized cache or database migration is required. Filtering scans the permitted media candidates, so large libraries can take longer than native indexed criteria.

## Development and validation

Requires .NET 10, Node.js 24, PowerShell, and a sibling Cove checkout named `cove`. Validated host source: `44aad02086d9640127fbe0c2dcfa2b862c0d6159`.

```powershell
npm ci
npm test
npx playwright install chromium
node tests/browser.mjs
dotnet run --project tests/Backend/Backend.csproj -c Release -p:CoveCiVersion=true
./scripts/package.ps1
dotnet run --project tests/Backend/Backend.csproj -c Release -p:CoveCiVersion=true -- --package artifacts/io.github.jiwenjimiran.nudity-level-1.0.0.zip
```

Packaging accepts `-CoveSourceRoot` for an alternative host checkout. The ZIP includes the extension assembly, runtime metadata, manifest, and frontend assets. Host assemblies and development dependencies are excluded. A SHA-256 file is generated beside the ZIP.

Backend checks cover all defaults, Full combinations, AI/manual precedence, settings persistence, missing/renamed tags, SQLite execution, PostgreSQL translation, request authorization, counts/pagination, and preserved query restrictions. If a built sibling `cove_filesizes` checkout exists, the tests also verify composition with its actual query adapter in both orders.

Frontend tests exercise React controlled filter state, saved values, clearing, cleanup, tag movement, library search/pagination, memberships, save/cancel/defaults, and denied editing. Browser checks use a Cove-shaped fixture at 360, 768, and 1440 pixels and write `artifacts/settings-preview.png`. Package validation extracts the ZIP and loads it through Cove's isolated extension loader, checking all assets, UI contributions, and API routes. These are fixture checks; they do not install into or modify a running library.
