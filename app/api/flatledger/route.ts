const SESSION_COOKIE = "flatledger2_session";
const SESSION_TOKEN_PREFIX = "fl2.";
const SESSION_MAX_AGE_SECONDS = 60 * 30;
const ALLOWED_CROSS_ORIGINS = new Set([
  "https://localhost",
  "https://mr-ads-codes.github.io",
]);
const colors = ["#7457e8", "#e86f51", "#2d9f78", "#e0a629", "#4285d4", "#c35391", "#725a48", "#63708f"];

type MemberRow = { id: string; name: string; color: string; active: number; is_admin: number };
type SessionMember = MemberRow | null;

function requestOriginAllowed(request: Request) {
  const origin = request.headers.get("origin");
  return !origin || origin === new URL(request.url).origin || ALLOWED_CROSS_ORIGINS.has(origin);
}

function corsHeaders(request: Request) {
  const headers = new Headers({ "Vary": "Origin" });
  const origin = request.headers.get("origin");
  if (origin && ALLOWED_CROSS_ORIGINS.has(origin)) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Access-Control-Allow-Headers", "Authorization, Content-Type");
    headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  }
  return headers;
}

function response(request: Request, data: unknown, status = 200, extraHeaders?: HeadersInit) {
  const headers = corsHeaders(request);
  new Headers(extraHeaders).forEach((value, key) => headers.set(key, value));
  return Response.json(data, { status, headers });
}

function makeId() {
  return `${Date.now()}-${crypto.randomUUID()}`;
}

async function hashPin(pin: string) {
  const bytes = new TextEncoder().encode(`flatledger2:${pin}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
}

function cookieValue(request: Request, name: string) {
  const cookie = request.headers.get("cookie") ?? "";
  return cookie.split(";").map(part => part.trim()).find(part => part.startsWith(`${name}=`))?.slice(name.length + 1) ?? null;
}

function sessionToken(request: Request) {
  const authorization = request.headers.get("authorization") ?? "";
  const bearer = authorization.match(/^Bearer\s+(.+)$/i)?.[1];
  return bearer ?? cookieValue(request, SESSION_COOKIE);
}

function sessionCookie(request: Request, token: string, maxAge: number) {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

async function initializeDatabase() {
  const { env } = await import("cloudflare:workers");
  const db = env.DB;
  if (!db) throw new Error("D1 database binding is unavailable");
  await db.batch([
    db.prepare("CREATE TABLE IF NOT EXISTS members (id TEXT PRIMARY KEY, name TEXT NOT NULL, pin_hash TEXT NOT NULL, color TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1, is_admin INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL)"),
    db.prepare("CREATE TABLE IF NOT EXISTS expenses (id TEXT PRIMARY KEY, title TEXT NOT NULL, amount INTEGER NOT NULL, category TEXT NOT NULL, paid_by TEXT NOT NULL, expense_date TEXT NOT NULL, created_by TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)"),
    db.prepare("CREATE TABLE IF NOT EXISTS expense_participants (expense_id TEXT NOT NULL, member_id TEXT NOT NULL, PRIMARY KEY (expense_id, member_id))"),
    db.prepare("CREATE TABLE IF NOT EXISTS settlements (id TEXT PRIMARY KEY, from_member TEXT NOT NULL, to_member TEXT NOT NULL, amount INTEGER NOT NULL, settlement_date TEXT NOT NULL, created_by TEXT NOT NULL, created_at TEXT NOT NULL)"),
    db.prepare("CREATE TABLE IF NOT EXISTS settlement_requests (id TEXT PRIMARY KEY, from_member TEXT NOT NULL, to_member TEXT NOT NULL, amount INTEGER NOT NULL, payment_method TEXT NOT NULL, request_date TEXT NOT NULL, settlement_month TEXT, status TEXT NOT NULL DEFAULT 'pending', created_at TEXT NOT NULL, responded_at TEXT, settlement_id TEXT)"),
    db.prepare("CREATE TABLE IF NOT EXISTS settlement_month_overrides (request_id TEXT PRIMARY KEY, settlement_month TEXT NOT NULL, reason TEXT NOT NULL, created_at TEXT NOT NULL)"),
    db.prepare("CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, member_id TEXT NOT NULL, expires_at INTEGER NOT NULL)"),
    db.prepare("CREATE INDEX IF NOT EXISTS expenses_date_idx ON expenses (expense_date)"),
    db.prepare("CREATE INDEX IF NOT EXISTS participants_expense_idx ON expense_participants (expense_id)"),
    db.prepare("CREATE INDEX IF NOT EXISTS settlement_requests_recipient_idx ON settlement_requests (to_member, status, created_at)"),
    db.prepare("CREATE INDEX IF NOT EXISTS settlement_requests_sender_idx ON settlement_requests (from_member, created_at)"),
    db.prepare("CREATE INDEX IF NOT EXISTS sessions_expiry_idx ON sessions (expires_at)"),
  ]);

  await db.prepare("DELETE FROM sessions WHERE expires_at <= ?").bind(Date.now()).run();
  return db;
}

async function authenticatedMember(request: Request): Promise<SessionMember> {
  const token = sessionToken(request);
  // Tokens issued before the 30-minute security policy are rejected without
  // changing any expense, settlement, member or historical data.
  if (!token?.startsWith(SESSION_TOKEN_PREFIX)) return null;
  const { env } = await import("cloudflare:workers");
  return (await env.DB.prepare("SELECT m.id, m.name, m.color, m.active, m.is_admin FROM sessions s JOIN members m ON m.id = s.member_id WHERE s.token = ? AND s.expires_at > ? AND m.active = 1")
    .bind(token, Date.now()).first<MemberRow>()) ?? null;
}

async function statePayload(currentUser: SessionMember) {
  const { env } = await import("cloudflare:workers");
  const db = env.DB;
  const profilesResult = await db.prepare("SELECT id, name, color, active, is_admin FROM members ORDER BY created_at").all<MemberRow>();
  const profiles = profilesResult.results.map(member => ({ id: member.id, name: member.name, color: member.color, active: Boolean(member.active), isAdmin: Boolean(member.is_admin) }));
  if (!currentUser) return { authenticated: false, members: profiles.filter(member => member.active) };

  const expenseResult = await db.prepare("SELECT id, title, amount, category, paid_by, expense_date, created_by, created_at FROM expenses ORDER BY expense_date, created_at").all<Record<string, string | number>>();
  const participantResult = await db.prepare("SELECT expense_id, member_id FROM expense_participants").all<{ expense_id: string; member_id: string }>();
  const participantMap = new Map<string, string[]>();
  participantResult.results.forEach(row => participantMap.set(row.expense_id, [...(participantMap.get(row.expense_id) ?? []), row.member_id]));
  const settlementResult = await db.prepare("SELECT s.id, s.from_member, s.to_member, s.amount, CASE WHEN smo.settlement_month IS NOT NULL THEN smo.settlement_month || '-01' WHEN sr.settlement_month IS NOT NULL THEN sr.settlement_month || '-01' ELSE s.settlement_date END AS effective_settlement_date, s.created_by FROM settlements s LEFT JOIN settlement_requests sr ON sr.settlement_id = s.id LEFT JOIN settlement_month_overrides smo ON smo.request_id = sr.id ORDER BY effective_settlement_date, s.created_at").all<Record<string, string | number>>();
  const settlementRequestResult = await db.prepare("SELECT sr.id, sr.from_member, sr.to_member, sr.amount, sr.payment_method, sr.request_date, COALESCE(smo.settlement_month, sr.settlement_month, substr(sr.request_date, 1, 7)) AS target_month, sr.status, sr.created_at, sr.responded_at FROM settlement_requests sr LEFT JOIN settlement_month_overrides smo ON smo.request_id = sr.id WHERE sr.from_member = ? OR sr.to_member = ? ORDER BY sr.created_at DESC")
    .bind(currentUser.id, currentUser.id).all<Record<string, string | number | null>>();

  return {
    authenticated: true,
    currentUser: { id: currentUser.id, name: currentUser.name, color: currentUser.color, isAdmin: Boolean(currentUser.is_admin) },
    members: profiles,
    expenses: expenseResult.results.map(row => ({ id: row.id, title: row.title, amount: row.amount, category: row.category, paidBy: row.paid_by, date: row.expense_date, createdBy: row.created_by, createdAt: row.created_at, participants: participantMap.get(String(row.id)) ?? [] })),
    settlements: settlementResult.results.map(row => ({ id: row.id, from: row.from_member, to: row.to_member, amount: row.amount, date: row.effective_settlement_date, createdBy: row.created_by })),
    settlementRequests: settlementRequestResult.results.map(row => ({ id: row.id, from: row.from_member, to: row.to_member, amount: row.amount, paymentMethod: row.payment_method, date: row.request_date, targetMonth: row.target_month, status: row.status, createdAt: row.created_at, respondedAt: row.responded_at })),
  };
}

export async function GET(request: Request) {
  try {
    if (!requestOriginAllowed(request)) return response(request, { error: "Origin not allowed" }, 403);
    await initializeDatabase();
    return response(request, await statePayload(await authenticatedMember(request)));
  } catch (error) {
    return response(request, { error: error instanceof Error ? error.message : "Unable to load FlatLedger" }, 500);
  }
}

export async function OPTIONS(request: Request) {
  if (!requestOriginAllowed(request)) return response(request, { error: "Origin not allowed" }, 403);
  return new Response(null, { status: 204, headers: corsHeaders(request) });
}

export async function POST(request: Request) {
  try {
    if (!requestOriginAllowed(request)) return response(request, { error: "Origin not allowed" }, 403);
    const db = await initializeDatabase();
    const body = await request.json() as Record<string, unknown>;
    const action = String(body.action ?? "");

    if (action === "bootstrapAdmin") {
      const existing = await db.prepare("SELECT id FROM members LIMIT 1").first<{ id: string }>();
      if (existing) return response(request, { error: "An administrator has already been set up" }, 409);
      const { env } = await import("cloudflare:workers");
      const setupKey = String(Reflect.get(env, "FLATLEDGER2_BOOTSTRAP_KEY") ?? "");
      const suppliedKey = String(body.setupKey ?? "").trim();
      if (!setupKey || suppliedKey !== setupKey) return response(request, { error: "Incorrect setup code" }, 403);
      const name = String(body.name ?? "").trim();
      const pin = String(body.pin ?? "");
      if (!name || !/^\d{4}$/.test(pin)) return response(request, { error: "Enter a name and four-digit PIN" }, 400);
      const result = await db.prepare("INSERT INTO members (id, name, pin_hash, color, active, is_admin, created_at) SELECT ?, ?, ?, ?, 1, 1, ? WHERE NOT EXISTS (SELECT 1 FROM members)")
        .bind(makeId(), name, await hashPin(pin), colors[0], new Date().toISOString()).run();
      if (result.meta.changes !== 1) return response(request, { error: "An administrator has already been set up" }, 409);
      return response(request, await statePayload(null));
    }

    if (action === "login") {
      const memberId = String(body.memberId ?? "");
      const pin = String(body.pin ?? "");
      const member = await db.prepare("SELECT id, pin_hash, active FROM members WHERE id = ?").bind(memberId).first<{ id: string; pin_hash: string; active: number }>();
      if (!member?.active || member.pin_hash !== await hashPin(pin)) return response(request, { error: "Incorrect PIN" }, 401);
      const token = SESSION_TOKEN_PREFIX + crypto.randomUUID() + crypto.randomUUID();
      // Security sessions are intentionally short-lived. The mobile client also
      // locks locally at the same deadline and requires the member PIN again.
      const maxAge = SESSION_MAX_AGE_SECONDS;
      await db.prepare("INSERT INTO sessions (token, member_id, expires_at) VALUES (?, ?, ?)").bind(token, member.id, Date.now() + maxAge * 1000).run();
      return response(request, { ok: true, token }, 200, { "Set-Cookie": sessionCookie(request, token, maxAge) });
    }

    if (action === "logout") {
      const token = sessionToken(request);
      if (token) await db.prepare("DELETE FROM sessions WHERE token = ?").bind(token).run();
      return response(request, { ok: true }, 200, { "Set-Cookie": sessionCookie(request, "", 0) });
    }

    const user = await authenticatedMember(request);
    if (!user) return response(request, { error: "Please sign in again" }, 401);
    const isAdmin = Boolean(user.is_admin);

    if (action === "saveExpense") {
      const item = body.expense as Record<string, unknown>;
      const id = String(item.id || makeId());
      const existing = await db.prepare("SELECT created_by, paid_by FROM expenses WHERE id = ?").bind(id).first<{ created_by: string; paid_by: string }>();
      if (existing && !isAdmin && existing.created_by !== user.id) return response(request, { error: "You cannot edit this expense" }, 403);
      const title = String(item.title ?? "").trim();
      const amount = Math.round(Number(item.amount));
      const category = String(item.category ?? "Other");
      // A new expense always belongs to the signed-in member. Existing records keep
      // their original payer so editing can never reassign another person's expense.
      const paidBy = existing?.paid_by ?? user.id;
      const date = String(item.date ?? "");
      const participants = Array.from(new Set((item.participants as unknown[] ?? []).map(String)));
      if (!title || !Number.isFinite(amount) || amount <= 0 || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !participants.length) return response(request, { error: "Please complete all expense fields" }, 400);
      const now = new Date().toISOString();
      const statements = existing
        ? [db.prepare("UPDATE expenses SET title = ?, amount = ?, category = ?, expense_date = ?, updated_at = ? WHERE id = ?").bind(title, amount, category, date, now, id)]
        : [db.prepare("INSERT INTO expenses (id, title, amount, category, paid_by, expense_date, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)").bind(id, title, amount, category, paidBy, date, user.id, now, now)];
      statements.push(db.prepare("DELETE FROM expense_participants WHERE expense_id = ?").bind(id));
      participants.forEach(memberId => statements.push(db.prepare("INSERT INTO expense_participants (expense_id, member_id) VALUES (?, ?)").bind(id, memberId)));
      await db.batch(statements);
    } else if (action === "deleteExpense") {
      const id = String(body.id ?? "");
      const existing = await db.prepare("SELECT created_by FROM expenses WHERE id = ?").bind(id).first<{ created_by: string }>();
      if (!existing || (!isAdmin && existing.created_by !== user.id)) return response(request, { error: "You cannot delete this expense" }, 403);
      await db.batch([db.prepare("DELETE FROM expense_participants WHERE expense_id = ?").bind(id), db.prepare("DELETE FROM expenses WHERE id = ?").bind(id)]);
    } else if (action === "addSettlement") {
      const item = body.settlement as Record<string, unknown>;
      const to = String(item.to ?? "");
      const amount = Math.round(Number(item.amount));
      const paymentMethod = String(item.paymentMethod ?? "");
      const settlementMonth = String(item.settlementMonth ?? "");
      const recipient = await db.prepare("SELECT id FROM members WHERE id = ? AND active = 1").bind(to).first<{ id: string }>();
      if (!recipient || to === user.id || !Number.isFinite(amount) || amount <= 0 || !["Cash", "Online"].includes(paymentMethod) || !/^\d{4}-\d{2}$/.test(settlementMonth)) {
        return response(request, { error: "Enter a valid settlement and payment method" }, 400);
      }
      const now = new Date().toISOString();
      await db.prepare("INSERT INTO settlement_requests (id, from_member, to_member, amount, payment_method, request_date, settlement_month, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?)")
        .bind(makeId(), user.id, to, amount, paymentMethod, now.slice(0, 10), settlementMonth, now).run();
    } else if (action === "respondSettlement") {
      const id = String(body.id ?? "");
      const decision = String(body.decision ?? "");
      const requestItem = await db.prepare("SELECT id, from_member, to_member, status, COALESCE(settlement_month, substr(request_date, 1, 7)) AS target_month FROM settlement_requests WHERE id = ?")
        .bind(id).first<{ id: string; from_member: string; to_member: string; status: string; target_month: string }>();
      if (!requestItem) return response(request, { error: "Settlement request not found" }, 404);
      if (requestItem.to_member !== user.id) return response(request, { error: "Only the recipient can confirm this payment" }, 403);
      if (requestItem.status !== "pending") return response(request, { error: "This payment request has already been answered" }, 409);
      const now = new Date().toISOString();
      if (decision === "rejected") {
        await db.prepare("UPDATE settlement_requests SET status = 'rejected', responded_at = ? WHERE id = ? AND status = 'pending'")
          .bind(now, id).run();
      } else if (decision === "accepted") {
        const settlementId = `confirmed-${id}`;
        await db.batch([
          db.prepare("UPDATE settlement_requests SET status = 'accepted', responded_at = ?, settlement_id = ? WHERE id = ? AND status = 'pending'")
            .bind(now, settlementId, id),
          db.prepare("INSERT OR IGNORE INTO settlements (id, from_member, to_member, amount, settlement_date, created_by, created_at) SELECT ?, from_member, to_member, amount, ?, from_member, ? FROM settlement_requests WHERE id = ? AND status = 'accepted' AND settlement_id = ?")
            .bind(settlementId, `${requestItem.target_month}-01`, now, id, settlementId),
        ]);
      } else {
        return response(request, { error: "Choose accept or reject" }, 400);
      }
    } else if (["addMember", "updateMember", "toggleMember"].includes(action)) {
      if (!isAdmin) return response(request, { error: "Only an administrator can manage members" }, 403);
      if (action === "addMember") {
        const name = String(body.name ?? "").trim(); const pin = String(body.pin ?? "");
        if (!name || !/^\d{4}$/.test(pin)) return response(request, { error: "Enter a name and four-digit PIN" }, 400);
        const count = await db.prepare("SELECT COUNT(*) AS count FROM members").first<{ count: number }>();
        await db.prepare("INSERT INTO members (id, name, pin_hash, color, active, is_admin, created_at) VALUES (?, ?, ?, ?, 1, 0, ?)").bind(makeId(), name, await hashPin(pin), colors[(count?.count ?? 0) % colors.length], new Date().toISOString()).run();
      } else if (action === "updateMember") {
        const id = String(body.id ?? ""); const name = String(body.name ?? "").trim(); const pin = String(body.pin ?? "");
        if (!name) return response(request, { error: "Member name is required" }, 400);
        if (pin && !/^\d{4}$/.test(pin)) return response(request, { error: "PIN must contain four digits" }, 400);
        if (pin) await db.prepare("UPDATE members SET name = ?, pin_hash = ? WHERE id = ?").bind(name, await hashPin(pin), id).run();
        else await db.prepare("UPDATE members SET name = ? WHERE id = ?").bind(name, id).run();
      } else {
        const id = String(body.id ?? ""); const active = Boolean(body.active);
        const target = await db.prepare("SELECT is_admin FROM members WHERE id = ?").bind(id).first<{ is_admin: number }>();
        if (target?.is_admin && !active) return response(request, { error: "The administrator cannot be removed" }, 400);
        await db.prepare("UPDATE members SET active = ? WHERE id = ?").bind(active ? 1 : 0, id).run();
        if (!active) await db.prepare("DELETE FROM sessions WHERE member_id = ?").bind(id).run();
      }
    } else return response(request, { error: "Unknown action" }, 400);

    return response(request, await statePayload(user));
  } catch (error) {
    return response(request, { error: error instanceof Error ? error.message : "FlatLedger request failed" }, 500);
  }
}
