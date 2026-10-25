import { fmtDate } from '../lib/format';

/** Gráfico de barras simple (una serie). Cada barra muestra su valor al pasar el mouse. */
export function BarChart({ data, label }: { data: { day: string; value: number }[]; label: string }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  const total = data.reduce((s, d) => s + d.value, 0);
  return (
    <figure className="mb-0" style={{ margin: 0 }}>
      <div className="bar-chart" role="img" aria-label={`${label}: ${total} en ${data.length} días`}>
        {data.map((d) => (
          <div key={d.day} className={`bar ${d.value === 0 ? 'zero' : ''}`} style={{ height: `${Math.max(3, (d.value / max) * 100)}%` }} title={`${fmtDate(d.day)}: ${d.value}`} />
        ))}
      </div>
      <figcaption className="row-between small subtle mt-1">
        <span>{data[0] && fmtDate(data[0].day)}</span>
        <span>{data.at(-1) && fmtDate(data.at(-1)!.day)}</span>
      </figcaption>
    </figure>
  );
}
