import type { ExtensionAPI, SessionEntry, SessionStartEvent } from "@mariozechner/pi-coding-agent";

const COMPACTION_STALE_AFTER_MS = 5 * 60 * 1000;

function isUserMessageEntry(
	entry: SessionEntry,
): entry is SessionEntry & { type: "message"; message: { role: "user" } } {
	return entry.type === "message" && entry.message.role === "user";
}

export default function (pi: ExtensionAPI) {
	let isCompacting = false;
	let compactionTimer: ReturnType<typeof setTimeout> | undefined;

	const clearCompactionState = () => {
		isCompacting = false;
		if (compactionTimer) {
			clearTimeout(compactionTimer);
			compactionTimer = undefined;
		}
	};

	const markCompactionStart = (signal?: AbortSignal) => {
		isCompacting = true;
		if (compactionTimer) {
			clearTimeout(compactionTimer);
		}
		compactionTimer = setTimeout(() => {
			compactionTimer = undefined;
			isCompacting = false;
		}, COMPACTION_STALE_AFTER_MS);

		signal?.addEventListener("abort", clearCompactionState, { once: true });
	};

	pi.on("session_start", async (_event: SessionStartEvent) => {
		clearCompactionState();
	});

	pi.on("session_shutdown", async () => {
		clearCompactionState();
	});

	pi.on("session_before_compact", async (event) => {
		markCompactionStart(event.signal);
	});

	pi.on("session_compact", async () => {
		clearCompactionState();
	});

	pi.on("agent_start", async () => {
		clearCompactionState();
	});

	pi.registerCommand("fuck", {
		description: "Abort the current run and recover the last user prompt into the editor",
		handler: async (args, ctx) => {
			if (args.trim()) {
				ctx.ui.notify("Usage: /fuck", "warning");
				return;
			}

			if (isCompacting) {
				ctx.ui.notify(
					"Can't /fuck during compaction. Press Esc to cancel compaction, then run /fuck again.",
					"warning",
				);
				return;
			}

			if (ctx.hasPendingMessages()) {
				ctx.ui.notify(
					"Can't /fuck while queued messages exist. Restore or send them first.",
					"warning",
				);
				return;
			}

			if (!ctx.isIdle()) {
				ctx.abort();
				await ctx.waitForIdle();
			}

			const branch = ctx.sessionManager.getBranch();
			let target: SessionEntry | undefined;
			for (let i = branch.length - 1; i >= 0; i--) {
				const entry = branch[i];
				if (entry && isUserMessageEntry(entry)) {
					target = entry;
					break;
				}
			}

			if (!target) {
				ctx.ui.notify("Nothing to recover on this branch. Use /tree for manual navigation.", "info");
				return;
			}

			const result = await ctx.navigateTree(target.id);
			if (result.cancelled) {
				ctx.ui.notify("Recovery cancelled.", "info");
				return;
			}

			ctx.ui.notify("fuck: navigated back to last prompt", "info");
		},
	});
}
