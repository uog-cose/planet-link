import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  LineChart,
  Line,
  Cell,
} from "recharts";

type ChartDatum = Record<string, string | number>;

const tooltipStyle = {
  background: "var(--surface)",
  border: "1px solid var(--border)",
  borderRadius: 12,
  color: "var(--text)",
  boxShadow: "0 10px 30px var(--color-rgba-23-59-50-12)",
};

const palette = [
  "var(--accent)",
  "var(--accent2)",
  "var(--q-orange)",
  "var(--warm)",
  "var(--q-purple)",
];

export function GroupRaceChart({ data }: { data: ChartDatum[] }) {
  const sorted = [...data].sort(
    (a, b) => Number(b.xp || 0) - Number(a.xp || 0),
  );
  return (
    <div className="quest-chart quest-chart-race">
      <ResponsiveContainer
        width="100%"
        height={Math.min(300, Math.max(160, sorted.length * 38))}
      >
        <BarChart
          data={sorted}
          layout="vertical"
          margin={{ top: 4, right: 12, bottom: 4, left: 2 }}
          barCategoryGap={18}
        >
          <CartesianGrid
            horizontal={false}
            stroke="var(--border)"
            strokeDasharray="3 5"
          />
          <XAxis
            type="number"
            domain={[0, "dataMax"]}
            tick={{ fill: "var(--muted)", fontSize: 9 }}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            type="category"
            dataKey="name"
            width={92}
            tick={{ fill: "var(--text)", fontSize: 10, fontWeight: 750 }}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip
            contentStyle={tooltipStyle}
            cursor={{ fill: "var(--tile1)" }}
            formatter={(value: any) => [Number(value).toLocaleString(), "XP"]}
          />
          <Bar
            dataKey="xp"
            name="xp"
            radius={[0, 8, 8, 0]}
            animationDuration={650}
          >
            {sorted.map((_, i) => (
              <Cell key={i} fill={palette[i % palette.length]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function AttendanceTrendChart({ data }: { data: ChartDatum[] }) {
  return (
    <div className="quest-chart quest-chart-attendance">
      <ResponsiveContainer width="100%" height={132}>
        <LineChart
          data={data}
          margin={{ top: 8, right: 8, left: -12, bottom: 0 }}
        >
          <CartesianGrid
            vertical={false}
            stroke="var(--border)"
            strokeDasharray="3 5"
          />
          <XAxis
            dataKey="label"
            tick={{ fill: "var(--muted)", fontSize: 8 }}
            tickLine={false}
            axisLine={false}
            interval="preserveStartEnd"
          />
          <YAxis
            allowDecimals={false}
            tick={{ fill: "var(--muted)", fontSize: 8 }}
            tickLine={false}
            axisLine={false}
            width={24}
          />
          <Tooltip
            contentStyle={tooltipStyle}
            cursor={{ stroke: "var(--accent)" }}
            formatter={(value: any) => [
              Number(value).toLocaleString(),
              "Attendance",
            ]}
          />
          <Line
            type="monotone"
            dataKey="attended"
            stroke="var(--accent2)"
            strokeWidth={3}
            dot={{ r: 2, fill: "var(--accent2)" }}
            activeDot={{ r: 5 }}
            animationDuration={650}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function ChallengeStatusChart({ data }: { data: ChartDatum[] }) {
  return (
    <div className="quest-chart quest-chart-challenges">
      <ResponsiveContainer width="100%" height={172}>
        <BarChart
          data={data}
          margin={{ top: 8, right: 8, left: -12, bottom: 4 }}
          barCategoryGap={18}
        >
          <CartesianGrid
            vertical={false}
            stroke="var(--border)"
            strokeDasharray="3 5"
          />
          <XAxis
            dataKey="label"
            tick={{ fill: "var(--text)", fontSize: 9, fontWeight: 800 }}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            allowDecimals={false}
            tick={{ fill: "var(--muted)", fontSize: 8 }}
            tickLine={false}
            axisLine={false}
            width={24}
          />
          <Tooltip
            contentStyle={tooltipStyle}
            cursor={{ fill: "var(--tile1)" }}
            formatter={(value: any) => [
              Number(value).toLocaleString(),
              "Challenges",
            ]}
          />
          <Bar dataKey="value" radius={[8, 8, 0, 0]} animationDuration={650}>
            {data.map((_, i) => (
              <Cell key={i} fill={palette[i % palette.length]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function HighRisersChart({ data }: { data: ChartDatum[] }) {
  return (
    <div className="quest-chart quest-chart-risers">
      <ResponsiveContainer width="100%" height={190}>
        <BarChart
          data={data}
          margin={{ top: 18, right: 8, left: -10, bottom: 4 }}
        >
          <CartesianGrid
            vertical={false}
            stroke="var(--border)"
            strokeDasharray="3 5"
          />
          <XAxis
            dataKey="name"
            tick={{ fill: "var(--text)", fontSize: 8, fontWeight: 800 }}
            tickLine={false}
            axisLine={false}
            interval={0}
          />
          <YAxis
            allowDecimals={false}
            tick={{ fill: "var(--muted)", fontSize: 8 }}
            tickLine={false}
            axisLine={false}
            width={30}
          />
          <Tooltip
            contentStyle={tooltipStyle}
            cursor={{ fill: "var(--tile1)" }}
            formatter={(value: any) => [
              `+${Number(value).toLocaleString()} XP`,
              "This week",
            ]}
          />
          <Bar dataKey="xp" radius={[8, 8, 0, 0]} animationDuration={650}>
            {data.map((_, i) => (
              <Cell
                key={i}
                fill={
                  i === 0
                    ? "var(--q-orange)"
                    : i === 1
                      ? "var(--accent2)"
                      : "var(--accent)"
                }
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
