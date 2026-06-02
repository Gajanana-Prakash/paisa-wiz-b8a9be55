const R = 70;
const CX = 90;
const CY = 90;
const CIRCUMFERENCE = 2 * Math.PI * R;

type Status = "on_track" | "attention" | "at_risk";

const STATUS_COLOR: Record<Status, string> = {
  on_track: "#16a34a",
  attention: "#d97706",
  at_risk: "#dc2626",
};

interface CpeProgressRingProps {
  earned: number;
  required: number;
  status: Status;
  size?: number;
}

export function CpeProgressRing({ earned, required, status, size = 180 }: CpeProgressRingProps) {
  const pct = Math.min(1, required > 0 ? earned / required : 0);
  const offset = CIRCUMFERENCE * (1 - pct);
  const color = STATUS_COLOR[status];
  const scale = size / 180;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 180 180"
      style={{ transform: `rotate(-90deg)`, display: "block" }}
    >
      <circle
        cx={CX} cy={CY} r={R}
        fill="none"
        stroke="currentColor"
        strokeWidth={12}
        className="text-muted/30"
      />
      <circle
        cx={CX} cy={CY} r={R}
        fill="none"
        stroke={color}
        strokeWidth={12}
        strokeLinecap="round"
        strokeDasharray={CIRCUMFERENCE}
        strokeDashoffset={offset}
        style={{ transition: "stroke-dashoffset 0.6s ease" }}
      />
    </svg>
  );
}
