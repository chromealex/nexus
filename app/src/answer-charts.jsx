import React from 'react';
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
} from 'recharts';
import {PALETTE} from './answer-widgets.jsx';

// Loaded lazily by answer-widgets.jsx so recharts stays out of the main bundle.
const axis = {stroke: '#7f9aa8', fontSize: 11, tickLine: false};
const tooltip = {
  contentStyle: {
    background: 'rgba(20,28,34,.96)',
    border: '1px solid #ffffff22',
    borderRadius: 10,
    color: '#e3e8ea',
    fontSize: 12,
  },
  itemStyle: {color: '#e3e8ea'},
  labelStyle: {color: '#a3aaae'},
  cursor: {fill: '#ffffff0a'},
};

export default function AnswerChart({kind, w, items, rows}) {
  if (kind === 'bar')
    return (
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={items} layout="vertical" margin={{left: 4, right: 24, top: 4, bottom: 4}}>
          <CartesianGrid horizontal={false} stroke="#ffffff10" />
          <XAxis type="number" {...axis} unit={w.unit} />
          <YAxis dataKey="name" type="category" width={120} {...axis} />
          <Tooltip {...tooltip} formatter={v => [v + (w.unit || ''), '']} />
          <Bar dataKey="value" radius={[0, 6, 6, 0]}>
            {items.map((_, i) => (
              <Cell key={i} fill={PALETTE[0]} fillOpacity={1 - i * 0.035} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    );
  if (kind === 'line')
    return (
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={rows} margin={{left: 0, right: 16, top: 8, bottom: 4}}>
          <CartesianGrid vertical={false} stroke="#ffffff10" />
          <XAxis dataKey="x" {...axis} />
          <YAxis {...axis} width={44} unit={w.unit} />
          <Tooltip {...tooltip} />
          {w.series.length > 1 && <Legend wrapperStyle={{fontSize: 12, color: '#a3aaae'}} />}
          {w.series.map((s, i) => (
            <Line
              key={s.name + i}
              type="monotone"
              dataKey={s.name}
              stroke={PALETTE[i]}
              strokeWidth={2}
              dot={{r: 2.5}}
              connectNulls={false}
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    );
  if (kind === 'pie')
    return (
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={w.items}
            dataKey="value"
            nameKey="label"
            innerRadius="58%"
            outerRadius="92%"
            paddingAngle={2}
            stroke="none"
            isAnimationActive={false}
          >
            {w.items.map((_, i) => (
              <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
            ))}
          </Pie>
          <Tooltip {...tooltip} />
        </PieChart>
      </ResponsiveContainer>
    );
  return null;
}
