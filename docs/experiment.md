# What did one reference frame change?

Adding the decoded one-second frame to a brief about paired posts led to one arch per row and three sampled colors. Two extra operators produced twelve arches across the corridor. Both worlds passed the same swept-sphere route check. This is a paired edit of one authored world.

| Measure | Text brief | Same brief and frame |
|---|---:|---:|
| Named prototypes | 3 | 3 |
| Written operators across prototypes | 8 | 10 |
| Generated boxes / arches | 24 / 0 | 24 / 12 |
| Solid boxes / occupied cells | 24 / 14 | 24 / 14 |
| Reachable nodes / declared nodes | 3 / 3 | 3 / 3 |
| Clear edges / declared edges | 2 / 2 | 2 / 2 |
| Median realization time, milliseconds | 0.0406 | 0.0541 |

## Inputs and choices

The brief reads “Fly straight through a passage marked by repeated pairs of dark posts. Keep the middle open.” One author encoded it as a row of two posts, four rows per station, and three stations. Both conditions use seed 1201, a 0.4 m player sphere, 12 m cells, and world limits of 40 instances and 128 operator executions. The route runs from entry through middle to exit along 48 m of the centre line. The last station continues beyond the exit. [Brief](../experiments/morphogenesis/brief.txt) · [Text condition and shared configuration](../experiments/morphogenesis/text.json)

The frame shows orange arcs meeting the dark uprights. The edit adds a translated decorative arch to the shared row and samples the sky, post and arc at the three pixel locations identified in the v0.1 review. In that order, the authored colors were `#b4c5d4`, `#39424c`, and `#dbc495`. The measured colors were `#b5ccc7`, `#334a53`, and `#ca603b`. The 10 m span comes from the authored post spacing. The original four-second synthetic clip and its extracted frame are repository MIT assets. [Frame](../examples/keyframe.png) · [Prior review and sample coordinates](../examples/flight-analysis.json) · [Media credits](../examples/CREDITS.md) · [Frame condition](../experiments/morphogenesis/frame.json)

## Measurement and limits

The runner validated both worlds, realized them with the shared engine, and checked both edges against the generated solids. It also checked that every original box, solid, and topology entry matched across conditions. The table counts each operator once where written. Expansion reuses the row at twelve locations. [Shared engine](../src/morph.js) · [Runner](../experiments/morphogenesis/measure.js)

Timings cover a complete in-memory realization including its internal validation and cell indexing. After 50 warmups per condition, one Node process timed 20 batches of 100 calls per condition, alternating which condition went first. The table reports the median batch mean. The run used Node 26.7.0 on Windows x64 and an AMD Ryzen 7 H 255. JSON loading, route inspection and rendering were outside the timer. CPU scheduling, garbage collection and concurrent work can affect these sub-millisecond measurements. [Raw batch measurements, input hashes and scene digests](../experiments/morphogenesis/report.json) · [Node high-resolution timer](https://nodejs.org/api/process.html#processhrtimebigint)

The author reviewed the storyboard, earlier analysis and frame before writing the baseline. The text condition therefore controls the written inputs and rules only. Prior knowledge could influence both designs. Sampling known feature locations gives the frame condition a direct palette match by construction. The arches are decorative, so the route check tests the posts in both conditions. One brief, one frame and one author cannot estimate independent model performance, motion recovery, perceptual fidelity or general improvement from video.

## Replay

From the repository root with project dependencies installed, run the commands below. The first uses Python and Pillow (13.0.0 in the recorded run) to check the stored frame digest, read its pixels and replay the authored edit. The second writes a fresh report. The experiment uses local fixtures and requires no inference service. Scene hashes can be compared across runs with the same engine and inputs. Timings will vary.

```sh
python experiments/morphogenesis/frame.py
node experiments/morphogenesis/measure.js
```

## Condition C — pace from moving footage

The moving clip supplies a timing cue the still frame lacks. A post first entered the measurement point at frame 23 (0.958 s), then again at frame 71 (2.958 s). At the world's authored spacing of 6 m per row, that two-second interval gives a forward speed of **3 m/s**. Conditions A and B both used 12 m/s. C applies the measured cadence to B's existing geometry. [Condition C world](../experiments/morphogenesis/video.json) · [Frame-by-frame measurements](../experiments/morphogenesis/temporal-report.json)

The analysis decoded all 96 frames at 24 fps. At scanline 140, the midpoint between the nearest dark post pixels on each side of x=240 estimates the passage centre. Sampling 110 pixels to its right follows the clip's lateral sway. A sample counts as dark when every RGB channel is below 100. Occupancy lasted from frames 23–29 and 71–77 inclusive. These windows yield **one** inter-entry interval. The original storyboard resets the depth phase every 48 frames and varies horizontal centring separately. The two-second recurrence therefore reflects the animator's loop. Inferring a row passage from it uses the repeating post pattern. Translating that cadence to metres per second depends on the authored row spacing. [Decoder and measurement code](../experiments/morphogenesis/video.py) · [Original storyboard](../tools/storyboard.py)

| Played in Chromium | B · single frame | C · moving footage |
|---|---:|---:|
| Forward displacement while holding W for 2 simulated seconds | 24.00 m | 6.00 m |
| Row spacings travelled | 4 | 1 |
| Rise after one Space flight action | 6.528 m | 1.632 m |
| Registered actions / collision hits | 1 / 0 | 1 / 0 |

The browser runner built each world through the project's custom-world path, focused the canvas, held W, released it, then pressed Space and advanced another 640 ms. Playwright controlled the animation clock so both worlds received the same simulated input duration. The runner recorded positions directly from the player. Space also scales lift with movement speed, so its smaller rise is a side effect of changing pace. The footage supplies evidence for forward cadence only. The runner verified equality of the complete B and C realized scenes. Each has 10 written operators, 36 items, 24 solids, three reachable nodes and two clear edges. [Browser runner](../experiments/morphogenesis/play.js) · [Browser measurements and version](../experiments/morphogenesis/play-report.json)

The original A/B timing batches remain in their original report. The C extension measures played displacement in simulated time. It adds one clip, one measured interval and one deterministic edit by the same informed author. Replaying the same synthetic loop provides no independent replication or estimate of typical real-video speeds.

To replay C from the repository root, install Pillow and imageio-ffmpeg for Python and the project's Playwright Chromium browser, then run:

```sh
python experiments/morphogenesis/video.py
node experiments/morphogenesis/play.js
```
