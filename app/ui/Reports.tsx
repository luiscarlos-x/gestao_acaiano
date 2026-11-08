"use client";
import { useState } from "react";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Wallet,
  Clock3,
  ArrowRight,
  ArrowLeftRight,
  ChartNoAxesCombined,
} from "lucide-react";
import { brl, numberPt, sortEntries, dayLabel } from "../../lib/gestao/model";
import type { Entry } from "../../lib/gestao/model";

export function Totals({ entries }: { entries: Entry[] }) {
  const paid = entries.filter((i) => i.status === "Concluído");
  const sum = (e: Entry[]) => e.reduce((s, v) => s + v.cents, 0);
  const credits = paid.filter((e) => e.type === "Entrada"),
    debits = paid.filter((e) => e.type === "Saída"),
    pending = entries.filter(
      (e) => e.type === "Saída" && e.status === "Pendente",
    );
  const missing = pending.filter((e) => e.cents === 0).length;
  const cards = [
    {
      title: "Entradas",
      value: sum(credits),
      note:
        credits.length +
        (credits.length === 1 ? " recebimento" : " recebimentos"),
      icon: ArrowDownLeft,
      theme: "green",
    },
    {
      title: "Saídas",
      value: sum(debits),
      note:
        debits.length + (debits.length === 1 ? " pagamento" : " pagamentos"),
      icon: ArrowUpRight,
      theme: "purple",
    },
    {
      title: "Saldo do período",
      value: sum(credits) - sum(debits),
      note: "Entradas menos saídas",
      icon: Wallet,
      theme: "dark",
    },
    {
      title: "A pagar",
      value: sum(pending),
      note:
        pending.length +
        (pending.length === 1 ? " pendente" : " pendentes") +
        (missing ? " · " + missing + " sem valor" : ""),
      icon: Clock3,
      theme: "amber",
    },
  ];
  return (
    <div className="kpis">
      {cards.map((c) => (
        <article className={"metric " + c.theme} key={c.title}>
          <div className="metric-head">
            <span>{c.title}</span>
            <i>
              <c.icon size={17} />
            </i>
          </div>
          <strong>{brl(c.value)}</strong>
          <small>{c.note}</small>
        </article>
      ))}
    </div>
  );
}
export function Flow({ entries, prior }: { entries: Entry[]; prior: number }) {
  const [mode, setMode] = useState<"saldo" | "movimento">("saldo"),
    [active, setActive] = useState<number | null>(null);
  const completed = sortEntries(
    entries.filter((e) => e.status === "Concluído"),
  );
  if (!completed.length)
    return (
      <section className="box flow">
        <h3>Evolução do caixa</h3>
        <div className="empty">
          <ChartNoAxesCombined />
          Os lançamentos concluídos aparecerão aqui.
        </div>
      </section>
    );
  const W = 600,
    H = 158,
    top = 12,
    bottom = 130,
    left = 53,
    right = 584;
  let running = prior;
  const points = [
    {
      value: mode === "saldo" ? prior : 0,
      label: "Saldo inicial",
      date: completed[0].date,
    },
    ...completed.map((e) => {
      const delta = e.type === "Entrada" ? e.cents : -e.cents;
      running += delta;
      return {
        value: mode === "saldo" ? running : delta,
        label: e.description,
        date: e.date,
      };
    }),
  ];
  const rawLow = Math.min(0, ...points.map((d) => d.value)),
    rawHigh = Math.max(0, ...points.map((d) => d.value));
  const rough = (rawHigh - rawLow || 10000) / 3,
    scale = 10 ** Math.floor(Math.log10(rough));
  const step =
    ([1, 2, 2.5, 5, 10].find((x) => x >= rough / scale) ?? 10) * scale;
  const low = Math.floor(rawLow / step) * step,
    high = rawHigh === rawLow ? low + step : Math.ceil(rawHigh / step) * step;
  const y = (n: number) => top + ((high - n) / (high - low)) * (bottom - top),
    x = (i: number) => left + (i / (points.length - 1)) * (right - left);
  const path = points
    .map((p, i) => (i ? "L" : "M") + x(i) + " " + y(p.value))
    .join(" ");
  const ticks = Array.from(
    { length: Math.round((high - low) / step) + 1 },
    (_, i) => high - i * step,
  );
  const chosen = active !== null ? points[active] : null;
  return (
    <section className="box flow">
      <div className="widget-head">
        <div>
          <h3>Evolução do caixa</h3>
          <p>
            {mode === "saldo"
              ? "Saldo após cada lançamento concluído"
              : "Valor de cada entrada e saída concluída"}
          </p>
        </div>
        <select
          className="mini-select"
          aria-label="Indicador do gráfico"
          value={mode}
          onChange={(e) => {
            setMode(e.target.value as typeof mode);
            setActive(null);
          }}
        >
          <option value="saldo">Saldo</option>
          <option value="movimento">Movimento</option>
        </select>
      </div>
      <div className="plot" onMouseLeave={() => setActive(null)}>
        <svg
          viewBox={"0 0 " + W + " " + H}
          preserveAspectRatio="none"
          role="img"
          aria-label="Gráfico em reais por ordem de lançamento"
        >
          <defs>
            <linearGradient id="area" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="#a958cb" stopOpacity=".23" />
              <stop offset="100%" stopColor="#a958cb" stopOpacity=".045" />
            </linearGradient>
          </defs>
          {ticks.map((t) => (
            <g key={t}>
              <line
                x1={left}
                x2={right}
                y1={y(t)}
                y2={y(t)}
                stroke="#e5e5e8"
                strokeDasharray="3 5"
              />
              <text x={left - 9} y={y(t) + 4} textAnchor="end">
                {numberPt(t / 100)}
              </text>
            </g>
          ))}
          <path
            d={
              path +
              " L" +
              right +
              " " +
              bottom +
              " L" +
              left +
              " " +
              bottom +
              " Z"
            }
            fill="url(#area)"
          />
          <path
            d={path}
            fill="none"
            stroke="#8b42b1"
            strokeWidth="2.8"
            vectorEffect="non-scaling-stroke"
            strokeLinejoin="round"
          />
          {points.map((p, i) => (
            <g key={i}>
              <circle
                cx={x(i)}
                cy={y(p.value)}
                r={active === i ? 5 : 3.3}
                fill="#fff"
                stroke="#9148b6"
                strokeWidth="2"
              />
              <rect
                x={Math.max(
                  left - 8,
                  x(i) - (right - left) / (points.length - 1) / 2,
                )}
                y="0"
                width={(right - left) / (points.length - 1)}
                height={bottom + 5}
                fill="transparent"
                tabIndex={0}
                aria-label={p.label + " " + brl(p.value)}
                onFocus={() => setActive(i)}
                onBlur={() => setActive(null)}
                onMouseEnter={() => setActive(i)}
                onClick={() => setActive(i)}
              />
            </g>
          ))}
          <text x={left} y="153">
            {dayLabel(points[0].date)}
          </text>
          <text x={right} y="153" textAnchor="end">
            {dayLabel(points[points.length - 1].date)}
          </text>
        </svg>
        {chosen && (
          <div className="chart-tip" role="status">
            <span>{chosen.label}</span>
            <b>{brl(chosen.value)}</b>
          </div>
        )}
      </div>
      <div className="chart-foot">
        <i className="line-key" />
        {mode === "saldo" ? "Saldo acumulado" : "Movimento realizado"}
        <span>Valores em R$</span>
      </div>
    </section>
  );
}
const colors = [
  "#8451a3",
  "#a8d953",
  "#ccaaeb",
  "#6ba99b",
  "#edb96b",
  "#6b79ae",
  "#a1a4a9",
];
export function Spending({ entries }: { entries: Entry[] }) {
  const all = new Map<string, number>();
  entries
    .filter((e) => e.type === "Saída" && e.status === "Concluído")
    .forEach((e) => all.set(e.category, (all.get(e.category) ?? 0) + e.cents));
  const cats = [...all].sort((a, b) => b[1] - a[1]),
    total = cats.reduce((s, r) => s + r[1], 0);
  let angle = 0;
  const arc = cats
    .map(([_, v], i) => {
      const start = angle;
      angle += (v / total) * 100;
      return colors[i % colors.length] + " " + start + "% " + angle + "%";
    })
    .join(",");
  return (
    <section className="box spending">
      <div className="widget-head">
        <div>
          <h3>Despesas por categoria</h3>
          <p>Distribuição das saídas pagas</p>
        </div>
      </div>
      {total ? (
        <>
          <div
            className="donut"
            role="img"
            aria-label={"Total de saídas pagas " + brl(total)}
            style={{ background: "conic-gradient(" + arc + ")" }}
          >
            <div>
              <small>Total de saídas</small>
              <b>{brl(total)}</b>
            </div>
          </div>
          <div className="legend">
            {cats.map(([cat, v], i) => (
              <div key={cat}>
                <i style={{ background: colors[i % colors.length] }} />
                <span>{cat}</span>
                <strong>
                  {numberPt(Math.round((v / total) * 1000) / 10)}%
                </strong>
              </div>
            ))}
          </div>
        </>
      ) : (
        <div className="empty">Nenhuma despesa paga no período.</div>
      )}
    </section>
  );
}
export function EntryTable({
  entries,
  open,
  more,
}: {
  entries: Entry[];
  open: (r: Entry) => void;
  more?: () => void;
}) {
  return (
    <section className="box tablebox">
      {more && (
        <div className="widget-head">
          <div>
            <h3>Últimos lançamentos</h3>
            <p>Movimentações mais recentes do período</p>
          </div>
          <button className="linkbtn" onClick={more}>
            Ver todos <ArrowRight size={15} />
          </button>
        </div>
      )}
      {entries.length ? (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Descrição</th>
                <th>Data</th>
                <th>Categoria</th>
                <th>Status</th>
                <th className="amount">Valor</th>
                <th aria-label="Editar" />
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.id} onClick={() => open(e)}>
                  <td>
                    <button
                      className="rowtitle"
                      onClick={(ev) => {
                        ev.stopPropagation();
                        open(e);
                      }}
                    >
                      <span
                        className={
                          "row-icon " +
                          (e.type === "Entrada" ? "income" : "expense")
                        }
                      >
                        {e.type === "Entrada" ? (
                          <ArrowDownLeft size={16} />
                        ) : (
                          <ArrowUpRight size={16} />
                        )}
                      </span>
                      {e.description}
                    </button>
                  </td>
                  <td>{dayLabel(e.date)}</td>
                  <td>{e.category}</td>
                  <td>
                    <span
                      className={
                        "status " +
                        (e.status === "Pendente" ? "pending" : "done")
                      }
                    >
                      <i />
                      {e.status}
                    </span>
                  </td>
                  <td
                    className={
                      "amount " + (e.type === "Entrada" ? "positive" : "")
                    }
                  >
                    {e.type === "Entrada" ? "+" : "−"} {brl(e.cents)}
                  </td>
                  <td className="arrowcell">
                    <ArrowUpRight size={14} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="empty">
          <ArrowLeftRight />
          Nenhum lançamento encontrado.
        </div>
      )}
    </section>
  );
}
