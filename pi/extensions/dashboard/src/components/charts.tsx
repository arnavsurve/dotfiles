/**
 * Inline SVG chart components. Brutalist. No frills.
 */

interface SparklineProps {
	data: number[];
	width?: number;
	height?: number;
}

export function Sparkline({ data, width = 300, height = 80 }: SparklineProps) {
	if (data.length < 2) return null;
	const max = Math.max(...data, 0.01);
	const pad = 6;
	const chartH = height - pad * 2;
	const points = data
		.map((v, i) => {
			const x = (i / (data.length - 1)) * width;
			const y = pad + chartH - (v / max) * chartH;
			return `${x},${y}`;
		})
		.join(" ");

	return (
		<svg width="100%" height="100%" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="block">
			<polyline points={points} fill="none" stroke="var(--color-fg)" strokeWidth="1.5" strokeLinejoin="round" />
		</svg>
	);
}

interface BarChartProps {
	data: number[];
	width?: number;
	height?: number;
}

export function BarChart({ data, width = 400, height = 120 }: BarChartProps) {
	if (data.length === 0) return null;
	const max = Math.max(...data, 1);
	const gap = 2;
	const barWidth = Math.max(2, (width - (data.length - 1) * gap) / data.length);

	return (
		<svg width="100%" height="100%" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="block">
			{data.map((v, i) => {
				const barHeight = Math.max(1, (v / max) * (height - 4));
				const x = i * (barWidth + gap);
				const y = height - barHeight;
				return <rect key={i} x={x} y={y} width={barWidth} height={barHeight} fill="var(--color-fg)" />;
			})}
		</svg>
	);
}

interface HBarProps {
	items: { label: string; value: number }[];
}

export function HorizontalBars({ items }: HBarProps) {
	if (items.length === 0) return null;
	const max = Math.max(...items.map((i) => i.value), 1);

	return (
		<div className="space-y-2">
			{items.map((item) => (
				<div key={item.label} className="flex items-center gap-3 text-[12px]">
					<span className="text-fg2 w-12 shrink-0 text-right">{item.label}</span>
					<div className="flex-1 h-3 bg-bg rounded overflow-hidden">
						<div
							className="h-full bg-fg3 rounded-none"
							style={{ width: `${(item.value / max) * 100}%` }}
						/>
					</div>
					<span className="text-fg3 w-8 text-right shrink-0">{item.value}</span>
				</div>
			))}
		</div>
	);
}
