export function timeAgo(ts: string | number): string {
	const ms = typeof ts === "number" ? Date.now() - ts : Date.now() - new Date(ts).getTime();
	const s = Math.floor(ms / 1000);
	if (s < 5) return "now";
	if (s < 60) return `${s}s ago`;
	if (s < 3600) return `${Math.floor(s / 60)}m ago`;
	if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
	return `${Math.floor(s / 86400)}d ago`;
}

export function fmtTokens(n: number): string {
	if (n < 1000) return n.toString();
	if (n < 1e6) return (n / 1000).toFixed(1) + "k";
	return (n / 1e6).toFixed(1) + "M";
}

export function fmtCost(c: number): string {
	if (c < 0.01) return "<$0.01";
	return "$" + c.toFixed(2);
}

export function shortModel(model: string | null): string {
	if (!model) return "—";
	return model.split("/").pop()!.replace(/^claude-/, "").replace(/-\d{8}$/, "");
}

export function statusLabel(status: string): string {
	if (status === "idle") return "idle";
	if (status === "streaming") return "thinking...";
	if (status.startsWith("tool:")) return status.slice(5);
	return status;
}

export function fmtTime(iso: string): string {
	return new Date(iso).toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
}
