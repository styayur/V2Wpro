# Compile a reviewed reference

From the checkout, run the commands below with Node and FFmpeg available. For an installed CLI, substitute `v2w` for `node cli.js`. Use a fresh filename for each review, compiled world, variant and evidence export.

```sh
node cli.js ingest examples/canopy-source.mp4
node cli.js analyze
node cli.js verify examples/reviews/canopy.json clip examples/canopy-source.mp4
node cli.js compile examples/reviews/canopy.json .v2w/canopy.json
node cli.js validate .v2w/canopy.json
node cli.js generate .v2w/canopy.json
node cli.js evidence .v2w/canopy.json .v2w/canopy-evidence.json
node cli.js preview .v2w/canopy.json
# In a second terminal
node cli.js evaluate .v2w/canopy.json
node cli.js report playtest/morph/report.json
```

`analyze [DIGEST ...]` writes a local review task in `.v2w/analysis-task.json`. Choose digest arguments to review a subset in a specified order. With no arguments it includes the project's ingested references in digest order. The packet contains local frame filenames, timestamps and source records. Open the selected frames before making a visual observation.

## Review contract

Use the complete reviews in `examples/reviews/{canopy,caldera,lattice}.json` as templates. The top-level keys are `format`, `sources`, `features` and `design`.

- Set `format` to `v2w-review-1`.
- Each source needs a unique ID, a kind (`brief`, `image` or `video`) and a locator. Supply a 64-digit hexadecimal SHA-256 when available. Compilation treats locators as citations. To compare a digest to local bytes, explicitly select the file with `verify`.
- Each feature needs a unique evidence ID, its source ID, a claim, a confidence from 0 to 1 and one of the four WorldIR evidence kinds. For a timed video citation, add `"time": [start, end]` in seconds and use a locator without a fragment. Compilation appends `#t=start,end`. A brief can support authored decisions. Record unresolved questions in `design.unknowns`.
- Put all WorldIR 2.0 fields except `version` and `evidence` under `design`. Every operator references a feature ID in its `evidence` field. Asset URIs resolve relative to the review file. New output directories receive copies of the declared assets. Keep source locators meaningful in the review's citation context.
- The compiler stores the original source table and the feature-to-source bindings in `extensions.v2wReview`. The evidence export includes both, plus the resolved claims, confidence, seed and unknowns. Keep this extension key available when authoring a design.

`compile`, `validate`, `generate` and `variant` check rule expansion, declared budgets, reachability from spawn and swept-sphere clearance for every listed edge. `generate` writes the evaluated 2.0 items, solids and cell memberships to `.v2w/scene.json`. Legacy generation writes `.v2w/chunks.json`.

## Revision, variation and rollback

For a lighting change, save `{"design":{"style":{"light":1.4}}}` as `lighting.json` and run the following commands. Object members merge recursively, arrays are replaced as a whole and a null member removes the field. [JSON Merge Patch, RFC 7396](https://www.rfc-editor.org/rfc/rfc7396)

```sh
node cli.js revise examples/reviews/canopy.json lighting.json .v2w/canopy-r2.review.json
node cli.js compile .v2w/canopy-r2.review.json .v2w/canopy-r2.json
node cli.js variant .v2w/canopy-r2.json 42 .v2w/canopy-s42.json
```

Compare the original and revised worlds with the same seed. For rollback, open the earlier world or recompile its saved review to a fresh filename. To preserve a v1 world and its portable assets, use `node cli.js migrate examples/island.json .v2w/compat/island.json`. The resulting file still declares 1.0 and runs through its original generator. The compatibility migration preserves every JSON field.

## Media and providers

Ingest accepts local MP4, MOV, MKV, WebM, JPEG, PNG and WebP files up to 128 MiB. It selects the demuxer from the extension, restricts input protocols to local files, caps decoded dimensions at 16 megapixels and samples the first 256 seconds. Each decode pass has a 60-second timeout. Each reference produces at most 256 thumbnails within 480 × 480 pixels. FFmpeg's input duration, protocol and codec options are documented in the [FFmpeg manual](https://ffmpeg.org/ffmpeg-all.html).

The CLI uses local analysis. A program calling `dispatch` supplies a trusted adapter and its selected inputs. Mark a local adapter with `remote: false`. For a remote adapter set `remote: true` and pass `{ allowUpload: true }` as the fifth argument only with permission for that provider and payload. No CLI command requests credentials or dispatches a review to a service.
