# Integrations

session-viewer works with Live alone. These conventions unlock extra features. Each one is optional, and any tool
that can write a file or set a Live parameter can drive them. ClyphX Pro is only one example.

## Record length per musician

Off by default. Turn it on in Settings, "Recording lengths".

The band shows how many bars each musician's next take will last, and counts the bars while it records. The app does
not set the length: it reads it from files.

Folder: `data/rec-length/`, or the folder given by the `REC_LENGTH_DIR` environment variable.

**`NAME.json`**, one per musician. `NAME` is the musician's name as set in the app: capital letters A-Z only.

```json
{"bars": 4}
```

`bars` is a whole number from 1 to 64, or `null` for a free-length take. A file with any other content is ignored,
with a warning in the server's terminal.

**`takes.json`** (optional), the length each track's last fixed-length take was started with, so the phone can show
"2/4" instead of "2":

```json
{"sax 1": 4, "gtr 2": 8}
```

Keys are track names. Values are whole bars from 1 to 64.

Write each file to `NAME.json.tmp` and rename it, so the server never reads a half-written file. The server watches
the folder: changes show up immediately.

Try it by hand:

```bash
mkdir -p data/rec-length
echo '{"bars": 4}' > data/rec-length/ALEX.json
```

### Warning when a script writes elsewhere

If a script of yours writes the files, the app can tell you when it writes to a folder other than the one it reads
(a moved project, an old copy). The script must contain this line, with the folder in a single string:

```python
VIEWER_REC_LEN_DIR = os.path.expanduser("~/session-viewer/data/rec-length")
```

Name the scripts in the `REC_LENGTH_WRITERS` environment variable, comma-separated. They are looked up in
`~/Music/Ableton/User Library/Remote Scripts/_user_actions` unless `USER_ACTIONS_DIR` points elsewhere (a custom User
Library, another OS):

```bash
REC_LENGTH_WRITERS="rec_writer.py,other_writer.py" USER_ACTIONS_DIR="/path/to/_user_actions" npm start
```

To avoid typing them, put them in a `.env` file at the root of the project (`cp .env.example .env`).

Without `REC_LENGTH_WRITERS`, nothing is checked. A script missing from the machine is skipped.

### Example: a ClyphX Pro user action

A Python user action that writes the file when it sets the length (adapt the folder):

```python
import json, os

REC_LEN_DIR = os.path.expanduser("~/session-viewer/data/rec-length")

def write_rec_length(musician, bars):
    os.makedirs(REC_LEN_DIR, exist_ok=True)
    path = os.path.join(REC_LEN_DIR, musician + ".json")
    with open(path + ".tmp", "w") as f:
        json.dump({"bars": bars}, f)
    os.replace(path + ".tmp", path)
```

## Active chain

A rack on a track can show which of its chains is active, under the track header, and its knobs panel can follow
that chain. The app reads the chain from one **rack macro**:

- the macro is mapped to the rack's Chain Selector, so its value n selects the n-th chain in the list;
- value 0 selects no chain;
- by default it is macro 16. Change it in Settings, "Active chain macro" (1 to 16).

In the settings you choose, per track, which rack to follow and, per musician, which racks their knobs drive. Racks are
matched by name.

For a "chain" control, the knobs panel shows macros 1 to 8 of the **first rack inside the active chain**. The app cannot
see what a macro is mapped to, so name those inner macros after what they do.

## Clips that recall a chain

A clip named like this shows its chain name on the clip itself:

```
[CHAIN_3] "track name"/DEV("rack name") B2 P8 3
```

Only the `[CHAIN_n]` prefix matters to the app, and optionally the track and rack names after it. The rest is a
ClyphX Pro action that sets macro 16 (bank 2, parameter 8) when the clip launches. It is not needed otherwise.

A change of the chain macro within 200 ms of a clip launch on that track does not move the musician's focus on the
phone: it is the clip recalling its chain, not the musician turning a knob.

## Cue

A musician can have a cue: a return track plus a run of tracks. A track shows as cued when its **send** to that return
is at maximum (`1.0`, which is 127 on a MIDI controller). Any tool that pushes sends to the maximum works. Tracks
that are not covered by a cue show solo as cue.

## Overdub highlight

A Max for Live device named exactly `Overdub`, at the first level of the track (not inside a rack), with a parameter
named `Overdub`. When the parameter is on, the track is highlighted.

## Effect flags

In a track's sheet, "Effect indicator" picks a macro of a rack on another track. At 127, the track's header gets a cyan
outline. Use it to show that an effect switch is on. A macro at 126 does not count.

## Signal send

In Settings, "Folded corner when sending to" takes a return letter. Any track whose send to that return is above 0 gets a
folded corner on its header.

## Macro automation

If automation on a macro is overridden (you turned the knob), Live stops playing it until "Re-Enable Automation".
The app flags those macros in the knobs panel and in the diagnostics.
