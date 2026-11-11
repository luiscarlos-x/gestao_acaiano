"use client";
import { useEffect, useRef, useState } from "react";
import {
  LayoutDashboard,
  ArrowLeftRight,
  Boxes,
  ShoppingBasket,
  Calculator as CalcIcon,
  Menu,
  X,
  ChevronRight,
  ChevronDown,
  CalendarDays,
  Plus,
  Store,
  PanelLeft,
  Bell,
  ArrowRight,
  Search,
  Download,
  SlidersHorizontal,
  PackageCheck,
  ClipboardList,
  Check,
  AlertCircle,
  LoaderCircle,
  ShieldCheck,
  LogOut,
} from "lucide-react";
import type { Entry, Item, State } from "../../lib/gestao/model";
import {
  brl,
  dayLabel,
  monthLabel,
  numberPt,
  sortEntries,
  stockState,
  today,
} from "../../lib/gestao/model";
import { Totals, Flow, Spending, EntryTable } from "./Reports";
import { Modal, EntryForm, ItemForm, MoveForm, Calculator } from "./Forms";
import type { Action } from "./Forms";

const navigation = [
  { id: "overview", label: "Visão geral", icon: LayoutDashboard },
  { id: "cash", label: "Fluxo de caixa", icon: ArrowLeftRight },
  { id: "stock", label: "Estoque", icon: Boxes },
  { id: "buy", label: "Lista de compras", icon: ShoppingBasket },
  { id: "calc", label: "Simulador de lucro", icon: CalcIcon },
] as const;
type PageId = (typeof navigation)[number]["id"];
type ModalState =
  | { kind: "entry"; entry?: Entry }
  | { kind: "item"; item?: Item }
  | { kind: "move"; item: Item }
  | { kind: "period" }
  | { kind: "alerts" }
  | null;
type Period = { start: string; end: string };
function forMonth(m: string): Period {
  const [year, month] = m.split("-").map(Number);
  return {
    start: m + "-01",
    end: m + "-" + new Date(year, month, 0).getDate(),
  };
}
function defaultRange(data: State) {
  return forMonth(
    (sortEntries(data.entries).at(-1)?.date ?? today()).slice(0, 7),
  );
}
function periodName(p: Period) {
  if (!p.start && !p.end) return "Todo o período";
  const month = p.start.slice(0, 7);
  if (p.start.endsWith("-01") && p.end === forMonth(month).end)
    return monthLabel(month);
  return (
    dayLabel(p.start) +
    " – " +
    dayLabel(p.end, { day: "2-digit", month: "short", year: "numeric" })
  );
}
function PeriodForm({
  period,
  entries,
  apply,
}: {
  period: Period;
  entries: Entry[];
  apply: (r: Period) => void;
}) {
  const [start, setStart] = useState(period.start),
    [end, setEnd] = useState(period.end);
  const months = [
    ...new Set([
      today().slice(0, 7),
      ...entries.map((e) => e.date.slice(0, 7)),
    ]),
  ]
    .sort()
    .reverse();
  return (
    <>
      <div className="period-opt">
        <button
          className="secondary"
          onClick={() => apply({ start: "", end: "" })}
        >
          Todo o período
        </button>
        {months.slice(0, 8).map((m) => (
          <button
            className={
              "secondary " + (period.start === m + "-01" ? "opt-active" : "")
            }
            key={m}
            onClick={() => apply(forMonth(m))}
          >
            {monthLabel(m)}
          </button>
        ))}
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          apply({ start, end });
        }}
      >
        <h4>Período personalizado</h4>
        <div className="form-grid">
          <label>
            De
            <input
              type="date"
              required
              value={start}
              max={end || undefined}
              onChange={(e) => setStart(e.target.value)}
            />
          </label>
          <label>
            Até
            <input
              type="date"
              required
              value={end}
              min={start || undefined}
              onChange={(e) => setEnd(e.target.value)}
            />
          </label>
        </div>
        <div className="form-foot">
          <button className="primary">Aplicar período</button>
        </div>
      </form>
    </>
  );
}
function downloadCSV(rows: Entry[]) {
  const encode = (x: string) =>
    '"' + (/^[=+@\-\t\r]/.test(x) ? "'" : "") + x.replaceAll('"', '""') + '"';
  const data = [
    [
      "Data",
      "Descrição",
      "Categoria",
      "Tipo",
      "Valor (R$)",
      "Forma de pagamento",
      "Status",
    ],
    ...rows.map((e) => [
      e.date,
      e.description,
      e.category,
      e.type,
      (e.cents / 100).toFixed(2).replace(".", ","),
      e.payment,
      e.status,
    ]),
  ]
    .map((r) => r.map(encode).join(";"))
    .join("\r\n");
  const url = URL.createObjectURL(
    new Blob(["\uFEFF" + data], { type: "text/csv;charset=utf-8;" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = "acaiano-fluxo-de-caixa.csv";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function normalize(s: string) {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}
export default function Dashboard({ initial, userEmail }: { initial: State | null; userEmail?: string }) {
  const [data, setData] = useState<State | null>(initial),
    [page, setPage] = useState<PageId>("overview"),
    [mobile, setMobile] = useState(false),
    [modal, setModal] = useState<ModalState>(null);
  const [period, setPeriod] = useState<Period>(() =>
    initial ? defaultRange(initial) : { start: "", end: "" },
  );
  const [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(""),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(!initial);
  const [query, setQuery] = useState(""),
    [type, setType] = useState("Todos"),
    [status, setStatus] = useState("Todos"),
    [cashCategory, setCashCategory] = useState("Todas"),
    [stockFilter, setStockFilter] = useState("Todos"),
    [count, setCount] = useState(20);
  const saving = useRef(false),
    last = useRef<{ payload: string; id: string } | null>(null);
  async function refresh(first = false) {
    setLoading(true);
    try {
      const r = await fetch("/api/gestao", { cache: "no-store" });
      if (!r.ok)
        throw Error(
          ((await r.json()) as { error?: string }).error ??
            "Falha ao carregar os dados.",
        );
      const d = (await r.json()) as State;
      setData(d);
      if (first) setPeriod(defaultRange(d));
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao carregar os dados.");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    if (!initial) void refresh(true);
    const read = () => {
      const candidate = location.hash.replace("#", "");
      setPage(navigation.find((n) => n.id === candidate)?.id ?? "overview");
      setMobile(false);
    };
    read();
    window.addEventListener("hashchange", read);
    return () => window.removeEventListener("hashchange", read);
  }, []);
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(""), 4500);
    return () => clearTimeout(t);
  }, [notice]);
  useEffect(() => {
    setCount(20);
  }, [period, query, type, status, cashCategory]);
  function go(id: PageId) {
    setPage(id);
    location.hash = id;
    setMobile(false);
    setModal(null);
    setQuery("");
    setType("Todos");
    setStatus("Todos");
    setCashCategory("Todas");
    setStockFilter("Todos");
    window.scrollTo({ top: 0, behavior: "instant" });
  }
  function open(m: ModalState) {
    setError("");
    setModal(m);
  }
  async function save(change: Action, message: string) {
    if (!data || saving.current) return false;
    saving.current = true;
    setBusy(true);
    setError("");
    const payload = JSON.stringify({ change, revision: data.revision });
    const actionId =
      last.current?.payload === payload ? last.current.id : crypto.randomUUID();
    last.current = { payload, id: actionId };
    try {
      const response = await fetch("/api/gestao", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ change, revision: data.revision, actionId }),
      });
      if (!response.ok) {
        if (response.status === 409) await refresh();
        throw Error(
          ((await response.json()) as { error?: string }).error ??
            "Falha ao salvar.",
        );
      }
      const fresh = (await response.json()) as State;
      setData(fresh);
      last.current = null;
      let outside = false;
      if (
        change.kind === "entry" &&
        ((period.start && change.data.date < period.start) ||
          (period.end && change.data.date > period.end))
      ) {
        setPeriod(forMonth(change.data.date.slice(0, 7)));
        outside = true;
      }
      setNotice(
        message +
          (outside ? " Período ajustado para a data do lançamento." : ""),
      );
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao salvar.");
      return false;
    } finally {
      setBusy(false);
      saving.current = false;
    }
  }
  const entries = sortEntries(data?.entries ?? []),
    shown = entries.filter(
      (e) =>
        (!period.start || e.date >= period.start) &&
        (!period.end || e.date <= period.end),
    );
  const stock = [...(data?.stock ?? [])].sort((a, b) =>
    a.name.localeCompare(b.name, "pt-BR"),
  );
  const restock = stock.filter((i) => stockState(i) === "Repor"),
    uncounted = stock.filter((i) => stockState(i) === "A conferir");
  const pending = entries.filter((e) => e.status === "Pendente"),
    alerts = pending.length + restock.length;
  const filtered = shown
    .filter(
      (e) =>
        (type === "Todos" || e.type === type) &&
        (status === "Todos" || e.status === status) &&
        (cashCategory === "Todas" || e.category === cashCategory) &&
        normalize(e.description + " " + e.category + " " + e.payment).includes(
          normalize(query),
        ),
    )
    .reverse();
  const prior = period.start
    ? entries
        .filter((e) => e.status === "Concluído" && e.date < period.start)
        .reduce((v, e) => v + (e.type === "Entrada" ? e.cents : -e.cents), 0)
    : 0;
  const pageInfo = navigation.find((n) => n.id === page)!;
  const periodBtn = (
    <button className="period-btn" onClick={() => open({ kind: "period" })}>
      <CalendarDays size={15} />
      {periodName(period)}
      <ChevronDown size={14} />
    </button>
  );
  const openEntry = (e: Entry) => open({ kind: "entry", entry: e });
  function stockJump(filter: string) {
    go("stock");
    setStockFilter(filter);
  }
  const renderNav = (nav: (typeof navigation)[number]) => (
    <a
      key={nav.id}
      href={"#" + nav.id}
      onClick={(e) => {
        e.preventDefault();
        go(nav.id);
      }}
      className={"nav-link " + (page === nav.id ? "active" : "")}
      aria-current={page === nav.id ? "page" : undefined}
    >
      <nav.icon size={18} />
      <span>{nav.label}</span>
      {page === nav.id && <span className="nav-dot" />}
    </a>
  );
  return (
    <div className="app-shell">
      {mobile && (
        <button
          className="scrim"
          aria-label="Fechar menu"
          onClick={() => setMobile(false)}
        />
      )}
      <aside className={"sidebar " + (mobile ? "show" : "")}>
        <div className="side-brand">
          <div className="brand-lock">
            <img src="/brand/fruto.png" alt="" />
            <img src="/brand/marca.png" alt="Açaíano" />
          </div>
          <button
            className="mobile-x"
            onClick={() => setMobile(false)}
            aria-label="Fechar menu"
          >
            <X size={20} />
          </button>
        </div>
        <div className="nav-group">GERENCIAMENTO</div>
        <nav>{navigation.slice(0, 4).map(renderNav)}</nav>
        <div className="nav-group nav-second">FERRAMENTAS</div>
        <nav>{renderNav(navigation[4])}</nav>
        <div className="side-bottom">
          <div className="store-ic">
            <Store size={18} />
          </div>
          <div>
            <b>Açaíano</b>
            <small>{userEmail || "Teresina, PI"}</small>
          </div>
          <form action="/auth/signout" method="POST" style={{ marginLeft: "auto" }}>
            <button type="submit" className="iconbtn" aria-label="Sair" title="Sair da conta">
              <LogOut size={15} />
            </button>
          </form>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <div className="crumb">
            <button
              className="mobile-toggle iconbtn"
              aria-label="Abrir menu"
              onClick={() => setMobile(true)}
            >
              <Menu size={20} />
            </button>
            <PanelLeft size={16} className="desktop-mark" />
            <span>Gestão</span>
            <ChevronRight size={13} />
            <b>{pageInfo.label}</b>
          </div>
          <div className="top-actions">
            <button
              className="bell"
              aria-label="Ver pendências"
              onClick={() => open({ kind: "alerts" })}
            >
              <Bell size={19} />
              {alerts > 0 && <i />}
            </button>
            <span className="separator" />
            <button
              className="primary add"
              disabled={!data}
              onClick={() => open({ kind: "entry" })}
            >
              <Plus size={18} />
              <span>Novo lançamento</span>
            </button>
          </div>
        </header>
        <main>
          {page === "overview" ? (
            <section className="hero">
              <div className="hero-foliage" />
              <div className="hero-rings" />
              <div className="hero-photo" />
              <div className="hero-copy">
                <div className="overline">
                  <i />
                  PAINEL DA AÇAÍTERIA
                </div>
                <h1>Visão geral</h1>
                <p>Seu caixa, estoque e compras em um só lugar.</p>
              </div>
            </section>
          ) : (
            <div className="page-title">
              <div>
                <h1>{pageInfo.label}</h1>
                <p>
                  {
                    {
                      cash: "Registre e acompanhe as entradas e saídas da loja.",
                      stock:
                        "Confira as quantidades e defina quando repor cada item.",
                      buy: "Veja o que comprar para chegar ao estoque desejado.",
                      calc: "Calcule o custo do copo, o preço de venda e o lucro estimado.",
                      overview: "",
                    }[page]
                  }
                </p>
              </div>
              {page === "stock" && (
                <button
                  className="primary"
                  onClick={() => open({ kind: "item" })}
                >
                  <Plus size={16} />
                  Novo item
                </button>
              )}
            </div>
          )}
          {!data ? (
            <div className="box loadbox">
              {loading ? (
                <>
                  <LoaderCircle className="spin" />
                  Carregando dados da loja…
                </>
              ) : (
                <>
                  <AlertCircle />
                  {error}
                  <button className="secondary" onClick={() => refresh(true)}>
                    Tentar novamente
                  </button>
                </>
              )}
            </div>
          ) : (
            <>
              {error && !modal && (
                <p className="error" role="alert">
                  {error}
                </p>
              )}
              {(page === "overview" || page === "cash") && (
                <>
                  <div className="section-title">
                    <h2>
                      {page === "overview"
                        ? "Resumo financeiro"
                        : "Resumo do período"}
                    </h2>
                    {periodBtn}
                  </div>
                  <Totals entries={shown} />
                </>
              )}
              {page === "overview" && (
                <>
                  <div className="charts">
                    <Flow entries={shown} prior={prior} />
                    <Spending
                      entries={shown}
                      periodLabel={periodName(period)}
                      onCategorySelect={(category) => {
                        go("cash");
                        setType("Saída");
                        setStatus("Concluído");
                        setCashCategory(category);
                      }}
                    />
                  </div>
                  <EntryTable
                    entries={[...shown].reverse().slice(0, 5)}
                    open={openEntry}
                    more={() => go("cash")}
                  />
                </>
              )}
              {page === "cash" && (
                <>
                  <div className="list-heading">
                    <h2>
                      Lançamentos <small>{filtered.length}</small>
                    </h2>
                    <button
                      className="secondary"
                      onClick={() => downloadCSV(filtered)}
                    >
                      <Download size={15} />
                      Exportar CSV
                    </button>
                  </div>
                  <div className="filterbar">
                    <label className="search">
                      <Search size={16} />
                      <input
                        aria-label="Buscar lançamento"
                        placeholder="Buscar lançamento"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                      />
                    </label>
                    <select
                      aria-label="Filtrar por tipo"
                      value={type}
                      onChange={(e) => setType(e.target.value)}
                    >
                      <option value="Todos">Todos os tipos</option>
                      <option>Entrada</option>
                      <option>Saída</option>
                    </select>
                    <select
                      aria-label="Filtrar por status"
                      value={status}
                      onChange={(e) => setStatus(e.target.value)}
                    >
                      <option value="Todos">Todos os status</option>
                      <option>Pendente</option>
                      <option>Concluído</option>
                    </select>
                    <select
                      aria-label="Filtrar categoria"
                      value={cashCategory}
                      onChange={(e) => setCashCategory(e.target.value)}
                    >
                      <option value="Todas">Todas as categorias</option>
                      {[...new Set(entries.map((e) => e.category))]
                        .sort()
                        .map((c) => (
                          <option key={c}>{c}</option>
                        ))}
                    </select>
                  </div>
                  <EntryTable
                    entries={filtered.slice(0, count)}
                    open={openEntry}
                  />
                  {filtered.length > count && (
                    <button
                      className="secondary loadmore"
                      onClick={() => setCount(count + 30)}
                    >
                      Mostrar mais
                    </button>
                  )}
                </>
              )}
              {page === "stock" && (
                <>
                  <div className="inventory-totals">
                    {[
                      ["Cadastrados", stock.length, "Todos"],
                      ["Precisam de reposição", restock.length, "Repor"],
                      ["A conferir", uncounted.length, "A conferir"],
                    ].map(([l, n, f]) => (
                      <button
                        key={String(l)}
                        onClick={() => setStockFilter(String(f))}
                        className={
                          "stockstat " + (stockFilter === f ? "picked" : "")
                        }
                      >
                        <span>{l}</span>
                        <strong>{n}</strong>
                      </button>
                    ))}
                  </div>
                  <div className="filterbar">
                    <label className="search">
                      <Search size={16} />
                      <input
                        aria-label="Buscar item no estoque"
                        placeholder="Buscar ingrediente ou embalagem"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                      />
                    </label>
                    <select
                      aria-label="Filtrar estoque"
                      value={stockFilter}
                      onChange={(e) => setStockFilter(e.target.value)}
                    >
                      <option value="Todos">Todos os itens</option>
                      <option>Em dia</option>
                      <option>Repor</option>
                      <option>A conferir</option>
                    </select>
                  </div>
                  <div className="box tablebox">
                    <div className="table-scroll">
                      <table>
                        <thead>
                          <tr>
                            <th>Item</th>
                            <th>Atual</th>
                            <th>Mínimo</th>
                            <th>Situação</th>
                            <th>Ações</th>
                          </tr>
                        </thead>
                        <tbody>
                          {stock
                            .filter(
                              (i) =>
                                normalize(i.name).includes(normalize(query)) &&
                                (stockFilter === "Todos" ||
                                  stockFilter === stockState(i)),
                            )
                            .map((i) => (
                              <tr key={i.id}>
                                <td>
                                  <b>{i.name}</b>
                                  <small className="cell-note">{i.group}</small>
                                </td>
                                <td>
                                  {i.qty === null
                                    ? "—"
                                    : numberPt(i.qty) + " " + i.unit}
                                </td>
                                <td>
                                  {i.minimum === null
                                    ? "—"
                                    : numberPt(i.minimum) + " " + i.unit}
                                </td>
                                <td>
                                  <span
                                    className={
                                      "status " +
                                      (stockState(i) === "Em dia"
                                        ? "done"
                                        : stockState(i) === "Repor"
                                          ? "pending"
                                          : "neutral")
                                    }
                                  >
                                    <i />
                                    {stockState(i)}
                                  </span>
                                </td>
                                <td>
                                  <div className="row-actions">
                                    <button
                                      className="text-action"
                                      onClick={() =>
                                        open({ kind: "item", item: i })
                                      }
                                    >
                                      {i.qty === null ? "Conferir" : "Editar"}
                                    </button>
                                    {i.qty !== null && (
                                      <button
                                        className="text-action"
                                        onClick={() =>
                                          open({ kind: "move", item: i })
                                        }
                                      >
                                        Movimentar
                                      </button>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                    </div>
                    {!stock.some(
                      (i) =>
                        normalize(i.name).includes(normalize(query)) &&
                        (stockFilter === "Todos" ||
                          stockFilter === stockState(i)),
                    ) && (
                      <div className="empty">
                        Nenhum item com esses filtros.
                      </div>
                    )}
                  </div>
                </>
              )}
              {page === "buy" && (
                <>
                  <div className="box buy-panel">
                    <div className="widget-head">
                      <div>
                        <h3>Reposição necessária</h3>
                        <p>Itens que atingiram o estoque mínimo</p>
                      </div>
                      <span className="count-pill">
                        {restock.length}{" "}
                        {restock.length === 1 ? "item" : "itens"}
                      </span>
                    </div>
                    {restock.length ? (
                      <div className="buy-list">
                        {restock.map((i) => (
                          <div key={i.id}>
                            <span className="buy-icon">
                              <ShoppingBasket size={21} />
                            </span>
                            <span>
                              <b>{i.name}</b>
                              <small>
                                Restam {numberPt(i.qty!)} {i.unit} · Desejado{" "}
                                {numberPt(i.target!)} {i.unit}
                              </small>
                            </span>
                            <strong>
                              Comprar {numberPt(i.target! - i.qty!)} {i.unit}
                            </strong>
                            <button
                              className="secondary"
                              onClick={() => open({ kind: "move", item: i })}
                            >
                              Registrar compra
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="empty">
                        <PackageCheck />
                        <b>
                          {uncounted.length === stock.length && stock.length
                            ? "Aguardando a primeira contagem"
                            : "Nenhum item conferido precisa de reposição"}
                        </b>
                        <span>
                          {uncounted.length
                            ? "Confira as quantidades em estoque para completar sua lista."
                            : "Os itens estão acima do mínimo definido."}
                        </span>
                      </div>
                    )}
                  </div>
                  {uncounted.length > 0 && (
                    <button
                      className="inventory-callout"
                      onClick={() => stockJump("A conferir")}
                    >
                      <ClipboardList />
                      <span>
                        <b>{uncounted.length} itens aguardam conferência</b>
                        <small>
                          Informe as quantidades e os limites de reposição.
                        </small>
                      </span>
                      <ArrowRight size={18} />
                    </button>
                  )}
                  {stock.some((i) => stockState(i) === "Em dia") && (
                    <button
                      className="inventory-callout"
                      onClick={() => stockJump("Em dia")}
                    >
                      <PackageCheck />
                      <span>
                        <b>Itens com estoque em dia</b>
                        <small>Veja o que pode ficar fora desta compra.</small>
                      </span>
                      <ArrowRight size={18} />
                    </button>
                  )}
                </>
              )}
              {page === "calc" && (
                <Calculator initial={data.plan} busy={busy} save={save} />
              )}
            </>
          )}
        </main>
      </div>
      {modal && (
        <Modal
          close={() => setModal(null)}
          busy={busy}
          title={
            modal.kind === "entry"
              ? modal.entry
                ? "Editar lançamento"
                : "Novo lançamento"
              : modal.kind === "item"
                ? modal.item
                  ? "Conferir estoque"
                  : "Novo item"
                : modal.kind === "period"
                  ? "Filtrar período"
                  : modal.kind === "alerts"
                    ? "Pendências da loja"
                    : "Movimentar estoque"
          }
        >
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          {modal.kind === "period" && (
            <PeriodForm
              period={period}
              entries={entries}
              apply={(p) => {
                setPeriod(p);
                setModal(null);
              }}
            />
          )}
          {modal.kind === "entry" && (
            <EntryForm
              entry={modal.entry}
              save={save}
              busy={busy}
              close={() => setModal(null)}
            />
          )}
          {modal.kind === "item" && (
            <ItemForm
              item={modal.item}
              save={save}
              busy={busy}
              close={() => setModal(null)}
            />
          )}
          {modal.kind === "move" && (
            <MoveForm
              item={modal.item}
              direction="in"
              save={save}
              busy={busy}
              close={() => setModal(null)}
            />
          )}
          {modal.kind === "alerts" && (
            <div className="alert-list">
              <button
                onClick={() => {
                  go("cash");
                  setPeriod({ start: "", end: "" });
                  setStatus("Pendente");
                }}
              >
                <ArrowLeftRight />
                <span>
                  <b>{pending.length} lançamentos pendentes</b>
                  <small>Ver entradas e saídas a concluir</small>
                </span>
                <ChevronRight />
              </button>
              <button onClick={() => go("buy")}>
                <ShoppingBasket />
                <span>
                  <b>{restock.length} itens para repor</b>
                  <small>Abrir lista de compras</small>
                </span>
                <ChevronRight />
              </button>
              {uncounted.length > 0 && (
                <button onClick={() => stockJump("A conferir")}>
                  <ClipboardList />
                  <span>
                    <b>{uncounted.length} itens a conferir</b>
                    <small>Informar contagem de estoque</small>
                  </span>
                  <ChevronRight />
                </button>
              )}
            </div>
          )}
        </Modal>
      )}
      {notice && (
        <div className="toast" role="status">
          <Check size={16} />
          {notice}
        </div>
      )}
    </div>
  );
}
