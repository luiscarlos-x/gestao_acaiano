import { z } from "zod";
import seedData from "./seed.json";
import { categories, defaultPlan, methods, units } from "./model";
import type { Entry, Item, Plan, State } from "./model";
import { createClient as createServerSupabaseClient } from "../supabase/server";
import { createClient as createDirectSupabaseClient } from "@supabase/supabase-js";

const seed: { entries: Entry[]; stock: Item[] } = seedData;

async function getSupabase() {
  try {
    return await createServerSupabaseClient();
  } catch {
    return createDirectSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    );
  }
}

export async function readState(owner: string): Promise<State> {
  const supabase = await getSupabase();

  // 1. Verificar se o workspace do usuário existe
  let { data: ws, error: wsErr } = await supabase
    .from("workspaces")
    .select("revision, last_action")
    .eq("owner", owner)
    .maybeSingle();

  if (wsErr) {
    console.error("Erro ao consultar workspace:", wsErr);
    throw new Error("Erro ao acessar dados do usuário.");
  }

  // Se não existir, inicializar o workspace, estoque e plano do usuário
  if (!ws) {
    const { error: insertWsErr } = await supabase
      .from("workspaces")
      .insert({ owner, revision: 0 });

    if (insertWsErr) {
      console.error("Erro ao criar workspace:", insertWsErr);
      throw new Error("Erro ao inicializar espaço de trabalho.");
    }

    // Inicializar itens de estoque padrão
    const stockToInsert = seed.stock.map((item) => ({
      id: item.id,
      owner,
      name: item.name,
      group: item.group,
      unit: item.unit,
      qty: item.qty,
      minimum: item.minimum,
      target: item.target,
    }));
    await supabase.from("stock_items").insert(stockToInsert);

    // Inicializar plano padrão
    await supabase.from("plans").insert({
      owner,
      ...defaultPlan,
    });

    ws = { revision: 0, last_action: null };
  }

  // 2. Buscar lançamentos, estoque e plano em paralelo
  const [entriesRes, stockRes, planRes] = await Promise.all([
    supabase
      .from("entries")
      .select("*")
      .eq("owner", owner)
      .order("order", { ascending: true }),
    supabase.from("stock_items").select("*").eq("owner", owner),
    supabase.from("plans").select("*").eq("owner", owner).maybeSingle(),
  ]);

  if (entriesRes.error) console.error("Erro ao buscar lançamentos:", entriesRes.error);
  if (stockRes.error) console.error("Erro ao buscar estoque:", stockRes.error);

  const entries: Entry[] = (entriesRes.data ?? []).map((e: any) => ({
    id: e.id,
    order: Number(e.order),
    date: String(e.date),
    description: e.description,
    category: e.category,
    type: e.type,
    cents: Number(e.cents),
    payment: e.payment,
    status: e.status,
  }));

  const stock: Item[] = (stockRes.data ?? []).map((i: any) => ({
    id: i.id,
    name: i.name,
    group: i.group,
    unit: i.unit,
    qty: i.qty !== null && i.qty !== undefined ? Number(i.qty) : null,
    minimum: i.minimum !== null && i.minimum !== undefined ? Number(i.minimum) : null,
    target: i.target !== null && i.target !== undefined ? Number(i.target) : null,
  }));

  const plan: Plan = planRes.data
    ? {
        orders: Number(planRes.data.orders),
        ticket: Number(planRes.data.ticket),
        days: Number(planRes.data.days),
        food: Number(planRes.data.food),
        pack: Number(planRes.data.pack),
        delivery: Number(planRes.data.delivery),
        fee: Number(planRes.data.fee),
        fixed: Number(planRes.data.fixed),
        ads: Number(planRes.data.ads),
        margin: Number(planRes.data.margin),
      }
    : defaultPlan;

  return {
    revision: Number(ws.revision),
    entries,
    stock,
    plan,
  };
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
  const state = await readState(owner);
  const supabase = await getSupabase();

  const { data: meta } = await supabase
    .from("workspaces")
    .select("revision, last_action")
    .eq("owner", owner)
    .single();

  if (meta?.last_action === actionId) return state;
  if (meta && meta.revision !== revision)
    throw new InputError(
      "Os dados mudaram em outra janela. Revise os valores atualizados e salve novamente.",
      409,
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
    const order = existing?.order ?? Date.now();

    const { error: upsertErr } = await supabase.from("entries").upsert({
      id: r.id,
      owner,
      order,
      date: r.date,
      description: r.description,
      category: r.category,
      type: r.type,
      cents: r.cents,
      payment: r.payment,
      status: r.status,
    });

    if (upsertErr) {
      console.error("Erro ao salvar lançamento:", upsertErr);
      throw new Error("Erro ao salvar lançamento.");
    }
  } else if (c.kind === "deleteEntry") {
    if (!state.entries.some((e) => e.id === c.id))
      throw new InputError("Lançamento não encontrado.");

    const { error: delErr } = await supabase
      .from("entries")
      .delete()
      .eq("owner", owner)
      .eq("id", c.id);

    if (delErr) {
      console.error("Erro ao excluir lançamento:", delErr);
      throw new Error("Erro ao excluir lançamento.");
    }
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

    const { error: itemErr } = await supabase.from("stock_items").upsert({
      id: i.id,
      owner,
      name: i.name,
      group: i.group,
      unit: i.unit,
      qty: i.qty,
      minimum: i.minimum,
      target: i.target,
    });

    if (itemErr) {
      console.error("Erro ao salvar item no estoque:", itemErr);
      throw new Error("Erro ao salvar item no estoque.");
    }
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

    const { error: moveErr } = await supabase
      .from("stock_items")
      .update({ qty })
      .eq("owner", owner)
      .eq("id", i.id);

    if (moveErr) {
      console.error("Erro ao movimentar estoque:", moveErr);
      throw new Error("Erro ao movimentar estoque.");
    }

    if (c.direction === "in" && c.cents > 0) {
      const { error: autoEntryErr } = await supabase.from("entries").upsert({
        id: actionId,
        owner,
        order: Date.now(),
        date: c.date,
        type: "Saída",
        category: i.group === "Embalagens" ? "Embalagens" : "Insumos",
        description: "Compra de " + i.name,
        cents: c.cents,
        payment: c.payment,
        status: "Concluído",
      });

      if (autoEntryErr) {
        console.error("Erro ao gerar lançamento de saída automática:", autoEntryErr);
      }
    }
  } else if (c.kind === "plan") {
    const { error: planErr } = await supabase.from("plans").upsert({
      owner,
      orders: c.data.orders,
      ticket: c.data.ticket,
      days: c.data.days,
      food: c.data.food,
      pack: c.data.pack,
      delivery: c.data.delivery,
      fee: c.data.fee,
      fixed: c.data.fixed,
      ads: c.data.ads,
      margin: c.data.margin,
    });

    if (planErr) {
      console.error("Erro ao salvar plano:", planErr);
      throw new Error("Erro ao salvar plano.");
    }
  }

  // Atualizar revisão no workspace para controle de concorrência
  const { error: updateWsErr } = await supabase
    .from("workspaces")
    .update({
      revision: revision + 1,
      last_action: actionId,
    })
    .eq("owner", owner)
    .eq("revision", revision);

  if (updateWsErr) {
    console.error("Erro ao atualizar revisão:", updateWsErr);
    throw new InputError(
      "Os dados mudaram em outra janela. Revise e tente novamente.",
      409,
    );
  }

  return readState(owner);
}
