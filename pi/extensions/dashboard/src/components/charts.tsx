/**
 * Inline SVG chart components. No charting library.
 */

interface SparklineProps {
	data: number[];
	width?: number;
	height?: number;
	color?: string;
}

export function Sparkline({ data, width = 200, height = 40, color = "var(--color-fg2)" }: SparklineProps) {
	if (data.length < 2) return null;
	const max = Math.max(...data, 1);
	const points = data
		.map((v, i) => {
			const x = (i / (data.length - 1)) * width;
			const y = height - (v / max) * (height - 4) - 2;
			return `${x},${y}`;
		})
		.join(" ");

	return (
		<svg width={width} height={height} className="block">
			<polyline points={points} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" />
		</svg>
	);
}

interface BarChartProps {
	data: number[];
	width?: number;
	height?: number;
	color?: string;
}

export function BarChart({ data, width = 200, height = 50, color = "var(--color-fg)" }: BarChartProps) {
	if (data.length === 0) return null;
	const max = Math.max(...data, 1);
	const barWidth = Math.max(1, (width - data.length) / data.length);
	const gap = 1;

	return (
		<svg width={width} height={height} className="block">
			{data.map((v, i) => {
				const barHeight = (v / max) * (height - 2);
				const x = i * (barWidth + gap);
				const y = height - barHeight;
				return <rect key={i} x={x} y={y} width={barWidth} height={barHeight} fill={color} rx="1" />;
			})}
		</svg>
	);
}

interface HBarProps {
	items: { label: string; value: number }[];
	maxWidth?: number;
}

export function HorizontalBars({ items, maxWidth = 160 }: HBarProps) {
	if (items.length === 0) return null;
	const max = Math.max(...items.map((i) => i.value), 1);

	return (
		<div className="space-y-1.5">
			{items.map((item) => (
				<div key={item.label} className="flex items-center gap-2 text-[11px]">
					<span className="text-fg2 w-12 shrink-0 text-right">{item.label}</span>
					<div className="flex-1 h-3 bg-bg rounded overflow-hidden">
						<div
							className="h-full bg-fg3 rounded"
							style={{ width: `${(item.value / max) * 100}%` }}
						/>
					</div>
					<span className="text-fg3 w-8 text-right shrink-0">{item.value}</span>
				</div>
			))}
		</div>
	);
}
