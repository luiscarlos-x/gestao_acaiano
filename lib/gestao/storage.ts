import { env } from "cloudflare:workers";
import { z } from "zod";
import seedData from "./seed.json";
import { categories, defaultPlan, methods, units } from "./model";
import type { Entry, Item, Plan, State } from "./model";

const seed: { entries: Entry[]; stock: Item[] } = seedData;

const database = () => {
  if (!env.DB) throw new Error("Banco de dados indisponível.");
  return env.DB;
};
export async function readState(owner: string): Promise<State> {
  const db = database();
  if (
    !(await db
      .prepare("SELECT 1 FROM workspaces WHERE owner=?")
      .bind(owner)
      .first())
  ) {
    const source = [
      ...seed.entries.map((r) => ["entry", r.id, JSON.stringify(r)]),
      ...seed.stock.map((r) => ["item", r.id, JSON.stringify(r)]),
    ];
    const init = source.map(([kind, id, value]) =>
      db
        .prepare(
          "INSERT INTO records (owner,kind,id,value) SELECT ?,?,?,? WHERE NOT EXISTS (SELECT 1 FROM workspaces WHERE owner=?)",
        )
        .bind(owner, kind, id, value, owner),
    );
    await db.batch([
      ...init,
      db
        .prepare(
          "INSERT OR IGNORE INTO workspaces(owner,revision) VALUES (?,0)",
        )
        .bind(owner),
    ]);
  }
  const [meta, rows] = await db.batch([
    db.prepare("SELECT revision FROM workspaces WHERE owner=?").bind(owner),
    db.prepare("SELECT kind,value FROM records WHERE owner=?").bind(owner),
  ]);
  const state: State = {
    revision: Number((meta.results[0] as { revision: number }).revision),
    entries: [],
    stock: [],
    plan: defaultPlan,
  };
  for (const r of rows.results as { kind: string; value: string }[]) {
    const v = JSON.parse(String(r.value));
    if (r.kind === "entry") state.entries.push(v);
    if (r.kind === "item") state.stock.push(v);
    if (r.kind === "plan") state.plan = v;
  }
  return state;
}
const textValue = z.string().trim().min(1).max(120);
const id = z.string().regex(/^[a-zA-Z0-9-]{1,72}$/);
const number = z.number().finite().min(0).max(1e7);
const amount = z.number().int().min(0).max(99999999999);
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((d) => {
    const t = new Date(d + "T00:00:00Z");
    return Number.isFinite(t.getTime()) && t.toISOString().slice(0, 10) === d;
  }, "Data inválida.");
const payment = z.string().refine((v) => methods.includes(v));
const entry = z.object({
  id,
  date,
  description: textValue,
  category: textValue,
  type: z.enum(["Entrada", "Saída"]),
  cents: amount,
  payment,
  status: z.enum(["Pendente", "Concluído"]),
});
const item = z.object({
  id,
  name: textValue,
  group: z.enum(["Ingredientes", "Embalagens", "Outros"]),
  unit: z.string().refine((v) => units.includes(v)),
  qty: number,
  minimum: number,
  target: number,
});
const plan = z.object({
  orders: number.int().positive(),
  ticket: number.positive(),
  days: number.int().min(1).max(31),
  food: number,
  pack: number,
  delivery: number,
  fee: number.max(99.99),
  fixed: number,
  ads: number,
  margin: number.max(99.99),
});
const change = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("entry"), data: entry }),
  z.object({ kind: z.literal("deleteEntry"), id }),
  z.object({ kind: z.literal("item"), data: item }),
  z.object({ kind: z.literal("plan"), data: plan }),
  z.object({
    kind: z.literal("move"),
    id,
    direction: z.enum(["in", "out"]),
    quantity: number.positive(),
    date,
    cents: amount,
    payment,
  }),
]);
const request = z.object({
  revision: z.number().int().nonnegative(),
  actionId: z.string().uuid(),
  change,
});
export class InputError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export async function mutate(owner: string, raw: unknown) {
  const validation = request.safeParse(raw);
  if (!validation.success)
    throw new InputError(
      "Confira os valores, a data e os campos obrigatórios.",
    );
  const { revision, actionId, change: c } = validation.data;
  const state = await readState(owner),
    db = database();
  const meta = await db
    .prepare("SELECT last_action FROM workspaces WHERE owner=?")
    .bind(owner)
    .first();
  if (meta?.last_action === actionId) return state;
  if (state.revision !== revision)
    throw new InputError(
      "Os dados mudaram em outra janela. Revise os valores atualizados e salve novamente.",
      409,
    );
  const ops: D1PreparedStatement[] = [];
  const upsert = (kind: string, recordId: string, value: Entry | Item | Plan) =>
    ops.push(
      db
        .prepare(
          "INSERT INTO records(owner,kind,id,value) SELECT ?,?,?,? WHERE (SELECT revision FROM workspaces WHERE owner=?)=? ON CONFLICT(owner,kind,id) DO UPDATE SET value=excluded.value",
        )
        .bind(owner, kind, recordId, JSON.stringify(value), owner, revision),
    );
  if (c.kind === "entry") {
    const r = c.data;
    if (
      !categories[r.type].includes(r.category) ||
      (!r.cents && r.status === "Concluído")
    )
      throw new InputError(
        "Para concluir, informe um valor maior que zero e uma categoria válida.",
      );
    const existing = state.entries.find((e) => e.id === r.id);
    upsert("entry", r.id, { ...r, order: existing?.order ?? Date.now() });
  } else if (c.kind === "deleteEntry") {
    if (!state.entries.some((e) => e.id === c.id))
      throw new InputError("Lançamento não encontrado.");
    ops.push(
      db
        .prepare(
          "DELETE FROM records WHERE owner=? AND kind='entry' AND id=? AND (SELECT revision FROM workspaces WHERE owner=?)=?",
        )
        .bind(owner, c.id, owner, revision),
    );
  } else if (c.kind === "item") {
    const i = c.data;
    if (i.target <= i.minimum)
      throw new InputError(
        "O estoque desejado precisa ser maior que o mínimo.",
      );
    if (
      i.unit === "un" &&
      ![i.qty, i.target, i.minimum].every(Number.isInteger)
    )
      throw new InputError("Use quantidades inteiras para unidades.");
    if (
      state.stock.some(
        (other) =>
          other.id !== i.id &&
          other.name.toLocaleLowerCase("pt-BR") ===
            i.name.toLocaleLowerCase("pt-BR"),
      )
    )
      throw new InputError("Já existe um item com esse nome.");
    upsert("item", i.id, i);
  } else if (c.kind === "move") {
    const i = state.stock.find((i) => i.id === c.id);
    if (!i || i.qty === null)
      throw new InputError(
        "Informe a contagem inicial deste item antes de movimentá-lo.",
      );
    if (i.unit === "un" && !Number.isInteger(c.quantity))
      throw new InputError("Use uma quantidade inteira para unidades.");
    const qty =
      Math.round(
        (i.qty + (c.direction === "in" ? c.quantity : -c.quantity)) * 1000,
      ) / 1000;
    if (qty < 0 || qty > 1e7)
      throw new InputError(
        "A quantidade ultrapassa o saldo disponível ou o limite de estoque.",
      );
    upsert("item", i.id, { ...i, qty });
    if (c.direction === "in" && c.cents > 0)
      upsert("entry", actionId, {
        id: actionId,
        order: Date.now(),
        date: c.date,
        type: "Saída",
        category: i.group === "Embalagens" ? "Embalagens" : "Insumos",
        description: "Compra de " + i.name,
        cents: c.cents,
        payment: c.payment,
        status: "Concluído",
      });
  } else upsert("plan", "monthly", c.data);
  ops.push(
    db
      .prepare(
        "UPDATE workspaces SET revision=revision+1,last_action=? WHERE owner=? AND revision=?",
      )
      .bind(actionId, owner, revision),
  );
  const result = await db.batch(ops);
  if (!result.at(-1)?.meta.changes)
    throw new InputError(
      "Os dados mudaram em outra janela. Revise e tente novamente.",
      409,
    );
  return readState(owner);
}
