import { getChatGPTUser } from "../../chatgpt-auth";
import { readState, mutate, InputError } from "../../../lib/gestao/storage";
export const dynamic = "force-dynamic";
async function handle(req: Request, write: boolean) {
  try {
    const user = await getChatGPTUser();
    const owner =
      user?.userId ??
      (process.env.NODE_ENV === "development" ? "local-preview" : null);
    if (!owner)
      return Response.json(
        { error: "Entre com sua conta para acessar a gestão." },
        { status: 401 },
      );
    if (
      write &&
      req.headers.get("origin") &&
      new URL(req.headers.get("origin")!).host !== new URL(req.url).host &&
      req.headers.get("sec-fetch-site") === "cross-site"
    )
      return Response.json({ error: "Origem inválida." }, { status: 403 });
    const state = write
      ? await mutate(owner, await req.json())
      : await readState(owner);
    return Response.json(state, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (e) {
    const known = e instanceof InputError;
    return Response.json(
      {
        error: known
          ? e.message
          : "Não foi possível acessar os dados. Tente novamente.",
      },
      { status: known ? e.status : 503 },
    );
  }
}
export const GET = (req: Request) => handle(req, false);
export const POST = (req: Request) => handle(req, true);
