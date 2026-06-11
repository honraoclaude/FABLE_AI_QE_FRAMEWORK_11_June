import { useEffect, useState } from 'react';
import { api, type Metric } from '../api';

export default function MetricsView() {
  const [metrics, setMetrics] = useState<Metric[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.metrics().then(setMetrics).catch((e) => setError(String(e)));
  }, []);

  return (
    <section className="panel">
      <h2>Core Quality Metrics</h2>
      <p className="hint">Derived live from portal data. Targets per the framework (§14.1).</p>
      {error && <p role="alert" className="badge bad">{error}</p>}
      <table>
        <thead>
          <tr>
            <th scope="col">Metric</th>
            <th scope="col">Definition</th>
            <th scope="col">Value</th>
            <th scope="col">Target</th>
            <th scope="col">Status</th>
          </tr>
        </thead>
        <tbody>
          {metrics.map((m) => (
            <tr key={m.id}>
              <td>{m.name}</td>
              <td className="hint">{m.definition}</td>
              <td>{m.value}{m.unit === '%' ? '%' : ` ${m.unit}`}</td>
              <td>{m.target}</td>
              <td>
                <span className={`badge ${m.met ? 'ok' : 'warn'}`}>{m.met ? 'on target' : 'off target'}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
