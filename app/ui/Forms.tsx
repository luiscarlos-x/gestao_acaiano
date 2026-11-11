"use client";
import { useEffect, useRef, useState } from "react";
import {
  X,
  ArrowDownLeft,
  ArrowUpRight,
  Trash2,
  ShoppingBasket,
  ArrowRight,
} from "lucide-react";
import type { Entry, Item, Plan } from "../../lib/gestao/model";
import {
  categories,
  methods,
  today,
  units,
  numberPt,
  brl,
  simulation,
} from "../../lib/gestao/model";
export type Action =
  | { kind: "entry"; data: Omit<Entry, "order"> }
  | { kind: "deleteEntry"; id: string }
  | { kind: "item"; data: Item }
  | {
      kind: "move";
      id: string;
      direction: "in" | "out";
      quantity: number;
      cents: number;
      date: string;
      payment: string;
    }
  | { kind: "plan"; data: Plan };
export type Save = (c: Action, message: string) => Promise<boolean>;
export function Modal({
  title,
  children,
  close,
  busy = false,
}: {
  title: string;
  children: React.ReactNode;
  close: () => void;
  busy?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dlg = ref.current,
      active = document.activeElement as HTMLElement;
    dlg?.showModal();
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      dlg?.close();
      document.body.style.overflow = original;
      active?.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className="modal"
      aria-label={title}
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) close();
      }}
      onClick={(e) => {
        if (!busy && e.target === ref.current) {
          const r = ref.current!.getBoundingClientRect();
          if (
            e.clientX < r.left ||
            e.clientX > r.right ||
            e.clientY < r.top ||
            e.clientY > r.bottom
          )
            close();
        }
      }}
    >
      <div className="modal-head">
        <h2>{title}</h2>
        <button
          className="iconbtn"
          aria-label="Fechar"
          disabled={busy}
          onClick={close}
        >
          <X size={20} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
export function EntryForm({
  entry,
  save,
  busy,
  close,
}: {
  entry?: Entry;
  save: Save;
  busy: boolean;
  close: () => void;
}) {
  const [entryId] = useState(() => entry?.id ?? crypto.randomUUID());
  const [type, setType] = useState<Entry["type"]>(entry?.type ?? "Entrada"),
    [confirm, setConfirm] = useState(false);
  const [status, setStatus] = useState(entry?.status ?? "Concluído");

  const [qty, setQty] = useState(1);
  const [unitPrice, setUnitPrice] = useState<string>(() =>
    entry ? (entry.cents / 100).toFixed(2) : "",
  );
  const [total, setTotal] = useState<string>(() =>
    entry ? (entry.cents / 100).toFixed(2) : "",
  );

  function handleQtyChange(newQty: number) {
    setQty(newQty);
    const u = parseFloat(unitPrice.replace(",", "."));
    if (!isNaN(u) && newQty > 0) {
      setTotal((newQty * u).toFixed(2));
    }
  }

  function handleUnitPriceChange(val: string) {
    setUnitPrice(val);
    const u = parseFloat(val.replace(",", "."));
    if (!isNaN(u) && qty > 0) {
      setTotal((qty * u).toFixed(2));
    } else if (!val) {
      setTotal("");
    }
  }

  function handleTotalChange(val: string) {
    setTotal(val);
    const t = parseFloat(val.replace(",", "."));
    if (!isNaN(t) && qty > 0) {
      setUnitPrice((t / qty).toFixed(2));
    } else if (!val) {
      setUnitPrice("");
    }
  }

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        let description = String(f.get("description")).trim();
        if (qty > 1 && !new RegExp(`\\b${qty}\\b`).test(description)) {
          description = `${description} (${qty} un)`;
        }
        const totalNum = parseFloat(total.replace(",", "."));
        const cents = Math.round((isNaN(totalNum) ? 0 : totalNum) * 100);

        if (
          await save(
            {
              kind: "entry",
              data: {
                id: entryId,
                date: String(f.get("date")),
                description,
                category: String(f.get("category")),
                type,
                status,
                payment: String(f.get("payment")),
                cents,
              },
            },
            "Lançamento salvo.",
          )
        )
          close();
      }}
    >
      <div className="segmented">
        <button
          type="button"
          className={type === "Entrada" ? "selected" : ""}
          onClick={() => setType("Entrada")}
        >
          <ArrowDownLeft size={16} />
          Entrada
        </button>
        <button
          type="button"
          className={type === "Saída" ? "selected" : ""}
          onClick={() => setType("Saída")}
        >
          <ArrowUpRight size={16} />
          Saída
        </button>
      </div>
      <div className="form-grid">
        <label className="wide">
          Descrição
          <input
            autoFocus
            maxLength={120}
            name="description"
            required
            defaultValue={entry?.description}
            placeholder={
              type === "Entrada"
                ? "Ex. Venda de açaí 500 ml"
                : "Ex. Compra de polpa de açaí"
            }
          />
        </label>

        <label>
          Quantidade
          <input
            type="number"
            min="1"
            step="1"
            required
            value={qty}
            onChange={(e) => {
              const val = parseInt(e.target.value, 10);
              handleQtyChange(isNaN(val) || val < 1 ? 1 : val);
            }}
          />
        </label>

        <label>
          Valor unitário (R$)
          <input
            type="number"
            step="0.01"
            min="0"
            placeholder="0,00"
            value={unitPrice}
            onChange={(e) => handleUnitPriceChange(e.target.value)}
          />
        </label>

        <label className="wide">
          Valor total (R$)
          <input
            required
            name="value"
            type="number"
            min={status === "Pendente" ? 0 : 0.01}
            max="999999999.99"
            step="0.01"
            value={total}
            onChange={(e) => handleTotalChange(e.target.value)}
            placeholder="0,00"
            style={{ fontWeight: 650, color: "var(--purple)" }}
          />
          {qty > 1 && total && (
            <small
              style={{
                color: "var(--muted)",
                fontSize: "11.5px",
                marginTop: "2px",
              }}
            >
              Cálculo: {qty} un ×{" "}
              {brl(Math.round((parseFloat(unitPrice) || 0) * 100))} ={" "}
              {brl(Math.round((parseFloat(total) || 0) * 100))}
            </small>
          )}
        </label>

        <label>
          Data
          <input
            type="date"
            name="date"
            required
            defaultValue={entry?.date ?? today()}
          />
        </label>

        <label>
          Categoria
          <select
            key={type}
            name="category"
            defaultValue={
              entry?.type === type ? entry.category : categories[type][0]
            }
          >
            {categories[type].map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
        </label>

        <label>
          Pagamento
          <select name="payment" defaultValue={entry?.payment ?? "PIX"}>
            {methods.map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
        </label>

        <label>
          Status
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as Entry["status"])}
          >
            <option>Concluído</option>
            <option>Pendente</option>
          </select>
        </label>
      </div>
      {confirm ? (
        <div className="delete-confirm">
          <p>Excluir este lançamento do fluxo de caixa?</p>
          <button
            type="button"
            className="danger"
            disabled={busy}
            onClick={async () => {
              if (
                entry &&
                (await save(
                  { kind: "deleteEntry", id: entry.id },
                  "Lançamento excluído.",
                ))
              )
                close();
            }}
          >
            Sim, excluir
          </button>
          <button
            type="button"
            className="secondary"
            onClick={() => setConfirm(false)}
          >
            Voltar
          </button>
        </div>
      ) : (
        <div className="form-foot">
          {entry && (
            <button
              type="button"
              className="removebtn"
              aria-label="Excluir lançamento"
              onClick={() => setConfirm(true)}
            >
              <Trash2 size={17} />
            </button>
          )}
          <button
            type="button"
            className="secondary"
            onClick={close}
            disabled={busy}
          >
            Cancelar
          </button>
          <button className="primary" disabled={busy}>
            {busy ? "Salvando…" : "Salvar lançamento"}
          </button>
        </div>
      )}
    </form>
  );
}
export function ItemForm({
  item,
  save,
  busy,
  close,
}: {
  item?: Item;
  save: Save;
  busy: boolean;
  close: () => void;
}) {
  const [itemId] = useState(() => item?.id ?? crypto.randomUUID());
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        if (
          await save(
            {
              kind: "item",
              data: {
                id: itemId,
                name: String(f.get("name")),
                group: String(f.get("group")),
                unit: String(f.get("unit")),
                qty: Number(f.get("qty")),
                minimum: Number(f.get("min")),
                target: Number(f.get("target")),
              },
            },
            "Estoque atualizado.",
          )
        )
          close();
      }}
    >
      <p className="modal-desc">
        Informe a contagem real. Ao atingir o mínimo, o item entra na lista de
        compras.
      </p>
      <div className="form-grid">
        <label className="wide">
          Nome do item
          <input
            required
            autoFocus
            name="name"
            maxLength={100}
            defaultValue={item?.name}
            placeholder="Ex. Açaí tradicional"
          />
        </label>
        <label>
          Grupo
          <select name="group" defaultValue={item?.group}>
            {["Ingredientes", "Embalagens", "Outros"].map((g) => (
              <option key={g}>{g}</option>
            ))}
          </select>
        </label>
        <label>
          Unidade
          <select name="unit" defaultValue={item?.unit ?? "kg"}>
            {units.map((g) => (
              <option key={g}>{g}</option>
            ))}
          </select>
        </label>
        <label className="wide">
          Quantidade atual
          <input
            name="qty"
            type="number"
            step=".001"
            min="0"
            max="10000000"
            required
            defaultValue={item?.qty ?? ""}
          />
        </label>
        <label>
          Estoque mínimo
          <input
            name="min"
            type="number"
            step=".001"
            min="0"
            max="10000000"
            required
            defaultValue={item?.minimum ?? ""}
          />
        </label>
        <label>
          Estoque desejado
          <input
            name="target"
            type="number"
            min=".001"
            max="10000000"
            step=".001"
            required
            defaultValue={item?.target ?? ""}
          />
        </label>
      </div>
      <div className="form-foot">
        <button type="button" className="secondary" onClick={close}>
          Cancelar
        </button>
        <button className="primary" disabled={busy}>
          Salvar item
        </button>
      </div>
    </form>
  );
}
export function MoveForm({
  item,
  direction,
  save,
  busy,
  close,
}: {
  item: Item;
  direction: "in" | "out";
  save: Save;
  busy: boolean;
  close: () => void;
}) {
  const [dir, setDir] = useState(direction);
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        if (
          await save(
            {
              kind: "move",
              id: item.id,
              direction: dir,
              quantity: Number(f.get("quantity")),
              cents: dir === "in" ? Math.round(Number(f.get("cost")) * 100) : 0,
              date: String(f.get("date") ?? today()),
              payment: String(f.get("pay") ?? "PIX"),
            },
            dir === "in" ? "Reposição registrada." : "Consumo registrado.",
          )
        )
          close();
      }}
    >
      <p className="modal-desc">
        <b>{item.name}</b> · {numberPt(item.qty ?? 0)} {item.unit} em estoque
      </p>
      <div className="segmented">
        <button
          type="button"
          className={dir === "in" ? "selected" : ""}
          onClick={() => setDir("in")}
        >
          Reposição
        </button>
        <button
          type="button"
          className={dir === "out" ? "selected" : ""}
          onClick={() => setDir("out")}
        >
          Consumo
        </button>
      </div>
      <div className="form-grid">
        <label className="wide">
          Quantidade ({item.unit})
          <input
            key={dir}
            name="quantity"
            type="number"
            min={item.unit === "un" ? 1 : 0.001}
            max={dir === "out" ? (item.qty ?? 0) : 1e7}
            step={item.unit === "un" ? 1 : 0.001}
            required
            defaultValue={
              dir === "in" && item.target !== null
                ? Math.max(0, item.target - (item.qty ?? 0)) || ""
                : ""
            }
          />
        </label>
        {dir === "in" && (
          <>
            <label>
              Valor pago (R$)
              <input
                name="cost"
                type="number"
                min="0"
                max="999999999"
                step=".01"
                placeholder="0,00"
              />
            </label>
            <label>
              Forma de pagamento
              <select name="pay">
                {methods.map((p) => (
                  <option key={p}>{p}</option>
                ))}
              </select>
            </label>
            <label className="wide">
              Data da compra
              <input name="date" type="date" required defaultValue={today()} />
            </label>
          </>
        )}
      </div>
      {dir === "in" && (
        <p className="helper">
          Preencha o valor pago para registrar também uma saída no caixa. Deixe
          em branco se a compra já foi lançada.
        </p>
      )}
      <div className="form-foot">
        <button type="button" className="secondary" onClick={close}>
          Cancelar
        </button>
        <button className="primary" disabled={busy}>
          Registrar {dir === "in" ? "reposição" : "consumo"}
        </button>
      </div>
    </form>
  );
}
export function Calculator({
  initial,
  save,
  busy,
}: {
  initial: Plan;
  save: Save;
  busy: boolean;
}) {
  const [v, setV] = useState<Record<keyof Plan, string>>(
    () =>
      Object.fromEntries(
        Object.entries(initial).map(([k, n]) => [k, String(n)]),
      ) as Record<keyof Plan, string>,
  );
  const p = Object.fromEntries(
    Object.entries(v).map(([k, s]) => [k, Number(s)]),
  ) as Plan;
  const res = simulation(p);
  const complete =
    Object.values(v).every(
      (s) => s.trim() !== "" && Number.isFinite(Number(s)) && Number(s) >= 0,
    ) &&
    p.food > 0 &&
    p.ticket > 0 &&
    p.days >= 1 &&
    p.days <= 31 &&
    p.orders >= 1 &&
    Number.isInteger(p.days) &&
    Number.isInteger(p.orders) &&
    p.fee < 100 &&
    p.margin < 100;
  const currency = (n: number) => brl(Math.round(n * 100));
  const fields = (pairs: [keyof Plan, string][]) =>
    pairs.map(([k, label]) => (
      <label key={k}>
        {label}
        <input
          aria-label={label}
          type="number"
          required
          min={
            ["orders", "days"].includes(k)
              ? 1
              : k === "food" || k === "ticket"
                ? 0.01
                : 0
          }
          max={k === "days" ? 31 : k === "fee" || k === "margin" ? 99.99 : 1e7}
          step={["orders", "days"].includes(k) ? 1 : 0.01}
          value={v[k]}
          onChange={(e) => setV({ ...v, [k]: e.target.value })}
        />
      </label>
    ));
  return (
    <div className="calc-layout">
      <form
        className="box sim-form"
        onSubmit={async (e) => {
          e.preventDefault();
          if (complete)
            await save({ kind: "plan", data: p }, "Simulação salva.");
        }}
      >
        <h3>Premissas de venda</h3>
        <div className="form-grid three">
          {fields([
            ["orders", "Pedidos por dia"],
            ["ticket", "Preço médio (R$)"],
            ["days", "Dias no mês"],
          ])}
        </div>
        <hr />
        <h3>Custos por pedido</h3>
        <div className="form-grid">
          {fields([
            ["food", "Açaí e complementos (R$)"],
            ["pack", "Embalagem (R$)"],
            ["delivery", "Entrega paga pela loja (R$)"],
            ["fee", "Taxas sobre a venda (%)"],
          ])}
        </div>
        <hr />
        <h3>Custos e meta do mês</h3>
        <div className="form-grid">
          {fields([
            ["fixed", "Custos fixos (R$)"],
            ["ads", "Marketing (R$)"],
            ["margin", "Margem desejada (%)"],
          ])}
        </div>
        <div className="form-foot">
          <button className="primary" disabled={busy || !complete}>
            Salvar simulação
          </button>
        </div>
      </form>
      <section className="box calc-results">
        <div className="widget-head">
          <div>
            <h3>Resultado estimado</h3>
            <p>Projeção mensal com as premissas ao lado</p>
          </div>
        </div>
        {!complete ? (
          <div className="calc-empty">
            <ShoppingBasket />
            <h4>Complete os custos do copo</h4>
            <p>
              Informe o custo do açaí e dos complementos e confira as demais
              premissas para calcular a margem.
            </p>
          </div>
        ) : (
          <>
            <div className="result-hero">
              <small>Lucro estimado no mês</small>
              <strong>{currency(res.profit)}</strong>
            </div>
            <dl>
              {[
                ["Receita estimada", currency(res.revenue)],
                ["Custos totais", currency(res.costs)],
                [
                  "Margem estimada",
                  numberPt(Math.round((res.margin ?? 0) * 10) / 10) + "%",
                ],
                [
                  "Ponto de equilíbrio",
                  res.breakEven === null
                    ? "Inviável com esse preço"
                    : numberPt(res.breakEven) + " pedidos/mês",
                ],
                [
                  "Preço para a margem desejada",
                  res.price === null
                    ? "Revise as taxas e a margem"
                    : currency(res.price),
                ],
              ].map(([k, val]) => (
                <div key={k}>
                  <dt>{k}</dt>
                  <dd>{val}</dd>
                </div>
              ))}
            </dl>
            <p className="helper">
              <ArrowRight size={14} /> O preço sugerido distribui os custos
              fixos entre os {numberPt(res.orders)} pedidos previstos.
            </p>
          </>
        )}
      </section>
    </div>
  );
}
