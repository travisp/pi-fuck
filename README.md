# pi-fuck

A small [pi](https://github.com/badlogic/pi-mono/tree/main/packages/coding-agent) extension for the moment you realize you messed up.

`/fuck` aborts the current run if needed, rewinds to before the most recent user prompt on the active branch, and restores that prompt into the editor so you can fix it and resubmit.

`/fuck?` does the same recovery, then suggests a conservative typo-only correction and lets you choose whether to use it. Note that this uses your currently configured model.

`/fuck!` destructively rewrites the current session file to remove the most recent user prompt and everything below it, then reloads that same session and restores the prompt into the editor.

_Inspired by the great [thefuck](https://github.com/nvbn/thefuck)._

## Install

Install from GitHub:

```bash
pi install git:github.com/travisp/pi-fuck
```

Quick one-off test:

```bash
pi -e git:github.com/travisp/pi-fuck
```

## Usage

Inside pi:

```text
/fuck
/fuck?
/fuck!
```

What `/fuck` does:

1. Aborts the current agent run if one is active
2. Finds the most recent real user message on the active branch
3. Rewinds to just before that prompt
4. Restores the prompt into the editor

What `/fuck?` does:

Runs the same recovery as `/fuck`, but then checks for typos:
- checks for /command typos directly
- checks for typos by asking the current model

If found, it shows the suggestion and asks if the user wants to use the suggestion instead

What `/fuck!` does:

Runs the same recovery as `/fuck`, but then destructively removes that prompt and its descendant subtree from the current session file

After `/fuck!` succeeds, or after tree navigation, it becomes unavailable until another real user prompt is sent. It is intended to only be used once to remove a clear mistake, not as general session history editing.

## Limitations

- It works on the **active branch only**
- It does **not** undo file or external side effects
- It does **not** work when queued messages exist
- It does **not** work when compaction is running
- `/fuck?` requires the current model to support tool calling and have usable credentials
- `/fuck!` only works immediately during or after a real user prompt; succeeding or navigating the tree makes it unavailable until another prompt is sent
- `/fuck!` is **destructive** and rewrites the current session file in place

**IT DOES NOT UNDO FILE SYSTEM OR OTHER EXTERNAL SIDE EFFECTS**

## Improvements under consideration

- undo file changes (or recommending/working with a different extension)
- /unfuck -> undo your /fuck (with the limitation that aborted agent runs can't be truly continued)
- allow it to work with queued messages or compaction (may require upstream changes or patching pi)
- more prompt repair helpers, e.g. `/fuck append ...`, `/fuck s/old/new/`, or `/fuck edit ...`

## License

MIT


