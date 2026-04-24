# pi-fuck

A small [pi](https://github.com/badlogic/pi-mono/tree/main/packages/coding-agent) extension for the moment you realize you messed up.

`/fuck` aborts the current run if needed, rewinds to before the most recent user prompt on the active branch, and restores that prompt into the editor so you can fix it and resubmit.

`/fuckhard` destructively rewrites the current session file to remove the most recent user prompt and everything below it, then reloads that same session and restores the prompt into the editor.

_Inspired by the great [thefuck](https://github.com/nvbn/thefuck)._

## Install

Install from GitHub:

```bash
pi install git:github.com/travisp/pi-fuck
```

Project-local install:

```bash
pi install -l git:github.com/travisp/pi-fuck
```

Local development install:

```bash
pi install /absolute/path/to/pi-fuck
```

Quick one-off test:

```bash
pi -e /absolute/path/to/pi-fuck
```

## Usage

Inside pi:

```text
/fuck
/fuckhard
```

What `/fuck` does:

1. Aborts the current agent run if one is active
2. Finds the most recent real user message on the active branch
3. Rewinds to just before that prompt
4. Restores the prompt into the editor

What `/fuckhard` does:

1. Only runs immediately during or after a real user prompt has been sent
2. Aborts the current agent run if one is active
3. Finds the most recent real user message on the active branch
4. Destructively removes that prompt and its descendant subtree from the current session file
5. Reloads the same session
6. Restores the prompt into the editor

After `/fuckhard` succeeds, or after tree navigation, it becomes unavailable until another real user prompt is sent. It is intended to only be used once to remove a clear mistake, not as general session history editing.

## Limitations

- It works on the **active branch only**
- It does **not** undo file or external side effects
- It does **not** work when queued messages exist
- It does **not** work when compaction is running
- `/fuckhard` only works immediately during or after a real user prompt; succeeding or navigating the tree makes it unavailable until another prompt is sent
- `/fuckhard` is **destructive** and rewrites the current session file in place

**IT DOES NOT UNDO FILE SYSTEM OR OTHER EXTERNAL SIDE EFFECTS**

## Improvements under consideration

- undo file changes (or recommending/working with a different extension)
- /unfuck -> undo your /fuck (with the limitation that aborted agent runs can't be truly continued)
- allow it to work with queued messages or compaction (may require upstream changes or patching pi)
- some automatic prompt-fixing (like bash "the fuck")

## License

MIT


