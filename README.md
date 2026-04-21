# pi-fuck

A small [pi](https://github.com/badlogic/pi-mono/tree/main/packages/coding-agent) extension for the moment you realize you messed up.

`/fuck` aborts the current run if needed, rewinds to before the most recent user prompt on the active branch, and restores that prompt into the editor so you can fix it and resubmit.

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
```

What it does:

1. Aborts the current agent run if one is active
2. Finds the most recent real user message on the active branch
3. Rewinds to just before that prompt
4. Restores the prompt into the editor

## Limitations

- It works on the **active branch only**
- It does **not** undo file or external side effects
- It does **not** work when queued messages exist
- It does **not** work when compaction is running

**IT DOES NOT UNDO FILE SYSTEM OR OTHER EXTERNAL SIDE EFFECTS**

## License

MIT


