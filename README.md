# Cove Nudity Level

Filter videos and images by **Unknown, None, Low, Medium, High, or Full**, using configurable AI-first body-tag rules. Requires **Cove 1.5.1 or newer**.

## Install

In **Settings â†’ Extensions â†’ Install from URL**, paste:

```text
https://github.com/jiwenjimiran/cove-nudity-level/releases/download/v1.2.1/io.github.jiwenjimiran.nudity-level-1.2.1.zip
```

Alternatively, download the ZIP from [the latest release](https://github.com/jiwenjimiran/cove-nudity-level/releases/latest) and use **Install from ZIP**. Enable the extension and refresh Cove once.

## Filter

Open **Filters â†’ Nudity level** on a video or image list, including drilldowns. Check any combination of levels to match any selected level. Clear all selections for no restriction. Saved filters retain the selections.

Filtering runs before pagination and preserves native filters, ordering, totals, and drilldown scope. It composes with Filesizes. Use this as a top-level filter on Cove 1.5.1; advanced condition-group placement returns an explanatory error.

## Default rules

**Pussy + Nipples â†’ Full. Asshole + Nipples â†’ Full. Balls or Dick alone â†’ Full.** The combination is evaluated before choosing the highest individual bucket. Other pussy descriptors in High and Anal Gape also qualify with Nipples.

**Pussy Hair is Medium and does not qualify for that combination.** Pussy Hair + Nipples is High.

Videos combine evidence anywhere in the whole item, even at different timestamps or from different people. This describes the item's tags, not a particular person's exposure.

| Bucket | Default tags |
|---|---|
| Neutral | Face, Fingers, Oiled, Wet (Water) |
| Low | Belly Button, Thighs, Feet, Lower Legs, Cum, Tongue, Spit |
| Medium | Ass, Boobs, Pussy Hair |
| High | Asshole, Anal Gape, Nipples, Pussy, Pussy Gape, Pussy Fully Visible, Pussy Closeup, Pussy Very Closeup, Wet Pussy, Very Wet Pussy, Cum on Pussy, Small Labia, Big Labia, Pierced Pussy, Very Hairy Pussy, Innie, Medium Labia, Spread Labia, Pink Pussy, Brown Pussy, Shaved Pussy |
| Full | Balls, Dick |

The defaults cover all **155 unique labels** from `body_20`, `positions_20`, `actions_30`, and `bdsm_20`. `69` appears in two models and has one shared assignment. Explicit sex acts and sexual positions establish Full even without body-model analysis.

| Additional level | Proxy defaults |
|---|---|
| Full | 69, Doggystyle, Facesitting, Cowgirl, Rev Cowgirl, Missionary, G Missionary, Orgy, Anal Fucking, Ass Licking, Ass Penetration, Ball Licking/Sucking, Blowjob, Cumshot, Deepthroat, Double Penetration, Fingering, Fisting, Gangbang, Handjob, Licking Penis, Masturbation, Pussy Licking (Clearly Visible), Pussy Licking, Titjob, Tribbing/Scissoring, Vaginal Penetration, Vaginal Fucking, Pegging, Anal Hook, Tied Penis, Tied Balls |
| High | Cum on Person, Cum Swapping, Pissing, Wet (Genitals), Crotch Roped |
| Medium | Upskirt, Grabbing Ass, Grabbing Boobs, Undressing, Bondaged Boobs |
| Low | Sucking Fingers |

All remaining labels in the additional models are Neutral with **no nudity signal**: generic poses, camera angles, performer counts, Kissing, Grabbing Hair/Head, non-specific bondage/equipment/torture, and Unused labels. These tags alone remain **Unknown**, including generic-only AI analysis. Neutral is an internal contribution, not a seventh filter level. Completed body analysis can establish **None**; the existing body-neutral tags retain that behavior. Individual buckets and matching rule results compete, with the highest result winning.

## Customize

Open **Settings â†’ Extensions â†’ Installed** and find the **Nudity Level** settings panel below the extension list. The dedicated **Nudity Level** settings tab remains available too. These settings apply to the whole installation.

- Buckets are full-width, collapsible rows. Drag a chip into another row, including its closed header. The chip follows your pointer and the destination highlights. Mouse and touch are supported; Escape cancels the drag. Collapse all reduces scrolling. There are no per-tag dropdowns. Keyboard users can focus a chip and use Alt + Up/Down to move it between levels.
- Use **Add tag** in any bucket to search the entire tag database by name or alias. Search is paginated; adding an already assigned database tag moves it rather than duplicating it.
- Click the x beside a tag to remove its assignment and rule memberships.
- Rules appear as compact condition-to-result summaries. Choose **Edit** to reveal the WHEN / AND / THEN editor, or **+ New rule** to create a named rule targeting None, Low, Medium, High, or Full. **ALL groups** must match; **ANY tag within a group** can match. For example, one group containing Pussy/Asshole and another containing Nipples produces `(Pussy OR Asshole) AND Nipples â†’ Full`.
- Use **+ Add tag** inside a condition to open a focused picker. Choose **Search the entire library** to find tags beyond the configured list. Selected alternatives are removable chips. Newly added rule-only tags start Neutral with no standalone signal; an existing tag keeps its bucket. Enable the completed rule to apply it. Enabled rules require nonempty groups.
- Rules can raise a level or establish None, but cannot lower stronger individual or rule evidence. Tags in the Full bucket qualify independently. The original body Full combination is provided as a default rule; new proxy tags do not automatically join it.
- Bucket moves preserve rule memberships, which are displayed on each chip. Removing a tag removes its memberships and disables rules left with an empty group.
- Use **Save** to apply changes, **Cancel** to discard the draft, or **Restore defaults** to replace the draft with the expanded 155 assignments and original Full rule. Restoring defaults still requires Save.

Version 1.2.1 moves all Chastity variants (including Cum in Chastity), Footjob, Pussy Rubbing, Gloryhole, Stand Cradle, Catheter, Weights, Clover Clamps, Clothes Pin, Alligator Clamp, Vibrating, Nipple Clamps, and Sucking Toy/Dildo to Neutral with no standalone nudity signal. The upgrade updates matching factory assignments once; manually moved/custom assignments, removed tags, bound IDs, and compound rules are preserved.

Upgrading from v1.0.0 adds the new model defaults once and converts the saved genital/nipple combination into an equivalent compound rule. Existing bucket edits, body-tag removals, custom assignments, bound IDs, and disabled/edited combination settings are preserved. After migration, removing a new default stays removed across reloads. Configurations use schema v2 and a defaults revision; the settings endpoints continue to accept v1 configurations for migration.

Preconfigured tags remain visible when absent from the library. Saving resolves available names/aliases to database IDs so later renames retain the assignment. Deleted custom tags are marked unavailable and do not count; they never silently bind to a replacement ID.

Administrators receive `io.github.jiwenjimiran.nudity-level.settings.write` by default. Other users can view the settings and need that permission to edit. Tag searches require `tags.read`; filtering additionally requires the corresponding media read permission and `airuns.read`.

## Evidence

Relevant configured AI tags from any model take precedence over manual tags. A completed `body_20` run establishes analysis coverage even when it detected no configured tags. Persisted body-model tag applications also establish coverage. Positive proxy tags or completed compound matches from other models provide applicable AI evidence; generic proxy tags alone do not establish coverage or suppress relevant manual fallback.

If applicable AI evidence exists, matching AI evidence alone determines the level. Otherwise, configured manual (`user`/`manual`) tag applications provide the fallback. Scraper evidence is excluded, as are AI applications tied to failed, cancelled, pending, or running runs. Source keys `ext:ai.*` and `ai:*` identify supported AI evidence.

The extension reads existing persisted detections; it introduces no confidence/duration threshold, performs no inference, and writes no library tags. Changing settings affects subsequent filter requests without a rescan. Classification is computed on demand in batches; no materialized cache or database migration is required. Filtering scans the permitted media candidates, so large libraries can take longer than native indexed criteria.

## Development and validation

Requires .NET 10, Node.js 24, PowerShell, and a sibling Cove checkout named `cove`. Validated host source: `44aad02086d9640127fbe0c2dcfa2b862c0d6159`.

```powershell
npm ci
npm test
npx playwright install chromium
dotnet run --project tests/Backend/Backend.csproj -c Release -p:CoveCiVersion=true
dotnet run --project tests/Backend/Backend.csproj -c Release -p:CoveCiVersion=true -- --fixtures artifacts
node tests/browser.mjs
./scripts/package.ps1
dotnet run --project tests/Backend/Backend.csproj -c Release -p:CoveCiVersion=true -- --package artifacts/io.github.jiwenjimiran.nudity-level-1.2.1.zip
```

Packaging accepts `-CoveSourceRoot` for an alternative host checkout. The ZIP includes the extension assembly, runtime metadata, manifest, and frontend assets. Host assemblies and development dependencies are excluded. A SHA-256 file is generated beside the ZIP.

Backend checks cover all defaults, Full combinations, AI/manual precedence, settings persistence, missing/renamed tags, SQLite execution, PostgreSQL translation, request authorization, counts/pagination, and preserved query restrictions. If a built sibling `cove_filesizes` checkout exists, the tests also verify composition with its actual query adapter in both orders.

Frontend tests exercise React controlled filter state, saved values, clearing, cleanup, tag movement, library search/pagination, compound rules, save/cancel/defaults, and denied editing. Browser checks compile the actual panel-selection callback and Installed/dedicated panel-rendering code from the sibling Cove checkout, use its real component registry, and load this extension's exported components. They reproduce the old missing-settings bug, verify both fixed entry points, full-width collapsible rows, live pointer previews, closed-row mouse/touch drops, Escape cancellation, chip removal and persisted rule creation, and check 360/768/1440-pixel layouts. The fixture substitutes the host card shell and network transport; it does not run the whole Cove application. It writes `artifacts/settings-preview.png`. Package validation loads the extracted ZIP through Cove's isolated extension loader and checks assets, both settings entries, filters, and API routes. Tests do not modify a running library.
