import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';
import { type Player, metrics, num } from './lib';
export default function StatChart({ player, metric }: { player: Player; metric: string }) {
  return (
    <>
      <div
        className="chart"
        role="img"
        aria-label={`${player.name}, ${metrics[metric]} by week, ${player.season} regular season`}
      >
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={player.weekly}>
            <defs>
              <linearGradient id="greenFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#39865c" stopOpacity={0.3} />
                <stop offset="100%" stopColor="#39865c" stopOpacity={0.01} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 4" vertical={false} stroke="#e8ece5" />
            <XAxis
              dataKey="week"
              tickLine={false}
              axisLine={false}
              tickFormatter={(w) => 'W' + w}
              tick={{ fontSize: 11 }}
            />
            <YAxis width={45} tickLine={false} axisLine={false} tick={{ fontSize: 11 }} />
            <Tooltip labelFormatter={(w) => 'Week ' + w} />
            <Area
              type="monotone"
              dataKey={metric}
              name={metrics[metric]}
              stroke="#287049"
              strokeWidth={2.5}
              fill="url(#greenFill)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <details className="chart-data">
        <summary>View chart data as a table</summary>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Week</th>
                <th>{metrics[metric]}</th>
              </tr>
            </thead>
            <tbody>
              {player.weekly.map((w) => (
                <tr key={w.week}>
                  <td>{w.week}</td>
                  <td>{num(w[metric])}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </>
  );
}
