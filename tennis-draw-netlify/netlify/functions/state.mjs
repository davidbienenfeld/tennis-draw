import { getStore } from "@netlify/blobs";
import { applyAction, migrate, summary, BadRequest } from "../../lib/state.mjs";

const KEY = "state";
const noStore = { "cache-control": "no-store" };

export default async (req) => {
  const store = getStore({ name: "tennis-draw", consistency: "strong" });

  if (req.method === "GET") {
    const state = migrate(await store.get(KEY, { type: "json" }));
    const id = new URL(req.url).searchParams.get("t");
    if (!id) {
      const list = Object.entries(state.tournaments).map(([tid, t]) => summary(tid, t))
        .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
      return Response.json({ tournaments: list }, { headers: noStore });
    }
    const t = state.tournaments[id];
    if (!t) return Response.json({ error: "That tournament doesn't exist. It may have been deleted." }, { status: 404, headers: noStore });
    return Response.json({ id, ...t }, { headers: noStore });
  }
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  let body;
  try { body = await req.json(); } catch { return Response.json({ error: "Request body must be JSON." }, { status: 400 }); }

  // Read, apply, and write back only if nobody else wrote in between; retry on a clash.
  for (let attempt = 0; attempt < 6; attempt++) {
    const current = await store.getWithMetadata(KEY, { type: "json" });
    let next, response;
    try {
      [next, response] = applyAction(current?.data, body);
    } catch (e) {
      if (e instanceof BadRequest) return Response.json({ error: e.message }, { status: 400 });
      throw e;
    }
    const { modified } = await store.setJSON(KEY, next, current ? { onlyIfMatch: current.etag } : { onlyIfNew: true });
    if (modified) return Response.json(response, { headers: noStore });
    await new Promise((r) => setTimeout(r, 40 + Math.random() * 120));
  }
  return Response.json({ error: "Too many people saving at once. Try again." }, { status: 409 });
};

export const config = { path: "/api/state" };
