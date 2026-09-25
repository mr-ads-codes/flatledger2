"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { Capacitor } from "@capacitor/core";

type Member = { id: string; name: string; color: string; active: boolean; isAdmin: boolean };
type CurrentUser = Pick<Member, "id" | "name" | "color" | "isAdmin">;
type Expense = { id: string; title: string; amount: number; category: string; paidBy: string; participants: string[]; date: string; createdBy: string; createdAt?: string };
type Settlement = { id: string; from: string; to: string; amount: number; date: string; createdBy: string };
type PaymentMethod = "Cash" | "Online";
type SettlementStatus = "pending" | "accepted" | "rejected";
type SettlementRequest = { id: string; from: string; to: string; amount: number; paymentMethod: PaymentMethod; date: string; targetMonth: string; status: SettlementStatus; createdAt: string; respondedAt: string | null };
type HistoryItem = { id: string; date: string; title: string; detail: string; amount: number; icon: string; direction?: "positive" | "negative" };
type View = "dashboard" | "expenses" | "reports" | "settings";
type StatePayload = { authenticated: boolean; currentUser?: CurrentUser; members: Member[]; expenses?: Expense[]; settlements?: Settlement[]; settlementRequests?: SettlementRequest[]; error?: string };

const REMOTE_API = "https://flatledger2.mr-ads.chatgpt.site/api/flatledger";
const GITHUB_PAGES_ORIGIN = "https://mr-ads-codes.github.io";
const TOKEN_KEY = "flatledger2_session_token";
const SESSION_EXPIRY_KEY = "flatledger2_session_expires_at";
const SESSION_DURATION_MS = 30 * 60 * 1000;
const money = (value: number) => `PKR ${Math.abs(value).toLocaleString("en-PK", { maximumFractionDigits: 0 })}`;
const monthKey = () => { const now = new Date(); return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`; };
const makeId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
const greetingForHour = (hour: number) => hour < 5 ? "Good night" : hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : hour < 22 ? "Good evening" : "Good night";
const monthLabel = (month: string) => new Date(month + "-02T12:00").toLocaleDateString("en-PK", { month: "long", year: "numeric" });
const entryTimestamp = (value?: string) => {
  if (!value) return "Entry time unavailable";
  const entered = new Date(value);
  const date = entered.toLocaleDateString("en-PK", { day: "2-digit", month: "long", year: "numeric", timeZone: "Asia/Karachi" });
  const time = entered.toLocaleTimeString("en-PK", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "Asia/Karachi" });
  return `Entered ${date} at ${time}`;
};

function apiUrl() {
  return typeof window !== "undefined" && (Capacitor.isNativePlatform() || window.location.origin === GITHUB_PAGES_ORIGIN)
    ? REMOTE_API
    : "/api/flatledger";
}

function authorizationHeaders(): Record<string, string> {
  if (typeof window === "undefined" || (!Capacitor.isNativePlatform() && window.location.origin !== GITHUB_PAGES_ORIGIN)) return {};
  const token = window.localStorage.getItem(TOKEN_KEY);
  const expiresAt = Number(window.localStorage.getItem(SESSION_EXPIRY_KEY) ?? 0);
  if (!token || !expiresAt || expiresAt <= Date.now()) {
    window.localStorage.removeItem(TOKEN_KEY);
    window.localStorage.removeItem(SESSION_EXPIRY_KEY);
    return {};
  }
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function clearSessionCredentials() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(TOKEN_KEY);
  window.localStorage.removeItem(SESSION_EXPIRY_KEY);
}

function BrandMark({ className = "" }: { className?: string }) {
  return <span className={`brand-mark ${className}`.trim()} aria-hidden="true"><svg viewBox="0 0 108 108" role="img">
    <path d="M17 30C31 14 55 9 89 13C81 21 75 29 71 38C51 32 33 33 18 41C15 37 15 33 17 30Z" />
    <path d="M20 46C36 39 54 39 72 45C67 53 61 60 54 66C41 61 30 62 21 68C17 61 17 52 20 46Z" />
    <path d="M29 71C39 66 48 67 58 72C53 80 46 87 37 93C31 87 28 80 29 71Z" />
  </svg></span>;
}

function LaunchScreen() {
  return <main className="launch-screen" aria-label="Opening FlatLedger2">
    <div className="launch-glow" />
    <BrandMark className="launch-mark" />
    <strong>FlatLedger2</strong>
    <span>YOUR SHARED HOME, IN SYNC</span>
  </main>;
}

export default function Home() {
  const [members, setMembers] = useState<Member[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const [settlementRequests, setSettlementRequests] = useState<SettlementRequest[]>([]);
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [loginMember, setLoginMember] = useState<Member | null>(null);
  const [pin, setPin] = useState("");
  const [setupName, setSetupName] = useState("");
  const [setupPin, setSetupPin] = useState("");
  const [setupKey, setSetupKey] = useState("");
  const [setupBusy, setSetupBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<View>("dashboard");
  const [month, setMonth] = useState(monthKey());
  const [showExpense, setShowExpense] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [showSettle, setShowSettle] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [historyMember, setHistoryMember] = useState<Member | null>(null);
  const [newMemberName, setNewMemberName] = useState("");
  const [newMemberPin, setNewMemberPin] = useState("");
  const [greeting, setGreeting] = useState("Hello");
  const [showLaunch, setShowLaunch] = useState(true);
  const [sessionExpiresAt, setSessionExpiresAt] = useState<number | null>(null);

  function applyState(data: StatePayload) {
    setMembers(data.members ?? []);
    if (data.authenticated && data.currentUser) {
      setCurrentUser(data.currentUser);
      setSessionExpiresAt(Number(window.localStorage.getItem(SESSION_EXPIRY_KEY) ?? 0) || null);
      setExpenses(data.expenses ?? []);
      setSettlements(data.settlements ?? []);
      setSettlementRequests(data.settlementRequests ?? []);
    } else {
      clearSessionCredentials();
      setCurrentUser(null);
      setSessionExpiresAt(null);
      setExpenses([]);
      setSettlements([]);
      setSettlementRequests([]);
    }
  }

  async function loadState(silent = false) {
    if (!silent) setLoading(true);
    try {
      const response = await fetch(apiUrl(), { cache: "no-store", headers: authorizationHeaders() });
      const data = await response.json() as StatePayload;
      if (!response.ok) throw new Error(data.error ?? "Unable to load FlatLedger");
      applyState(data);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Unable to load FlatLedger");
    } finally { if (!silent) setLoading(false); }
  }

  async function action(name: string, payload: Record<string, unknown> = {}) {
    setNotice("");
    const response = await fetch(apiUrl(), {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authorizationHeaders() },
      body: JSON.stringify({ action: name, ...payload }),
    });
    const data = await response.json() as StatePayload & { ok?: boolean; token?: string };
    if (!response.ok) { setNotice(data.error ?? "Request failed"); throw new Error(data.error ?? "Request failed"); }
    if (typeof window !== "undefined" && data.token) {
      const expiresAt = Date.now() + SESSION_DURATION_MS;
      window.localStorage.setItem(TOKEN_KEY, data.token);
      window.localStorage.setItem(SESSION_EXPIRY_KEY, String(expiresAt));
      setSessionExpiresAt(expiresAt);
    }
    if (typeof window !== "undefined" && name === "logout") {
      clearSessionCredentials();
      setSessionExpiresAt(null);
    }
    if (data.members) applyState(data);
    return data;
  }

  useEffect(() => {
    // A native launch always starts locked, even if the previous WebView left a token behind.
    if (Capacitor.isNativePlatform()) clearSessionCredentials();
    // Initial remote synchronization starts after the component mounts.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadState();
    const timer = window.setInterval(() => void loadState(true), 15000);
    const launchTimer = window.setTimeout(() => setShowLaunch(false), 1650);
    return () => { window.clearInterval(timer); window.clearTimeout(launchTimer); };
    // loadState intentionally stays stable for this mount-only polling lifecycle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const updateGreeting = () => setGreeting(greetingForHour(new Date().getHours()));
    updateGreeting();
    const timer = window.setInterval(updateGreeting, 60000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!currentUser || !sessionExpiresAt) return;
    const lockIfExpired = () => {
      if (Date.now() < sessionExpiresAt) return;
      clearSessionCredentials();
      setSessionExpiresAt(null);
      setCurrentUser(null);
      setExpenses([]);
      setSettlements([]);
      setSettlementRequests([]);
      setLoginMember(null);
      setPin("");
      setView("dashboard");
      setShowExpense(false);
      setShowSettle(false);
      setShowNotifications(false);
      setHistoryMember(null);
      setNotice("Your secure 30-minute session ended. Enter your PIN to continue.");
    };
    const timeout = window.setTimeout(lockIfExpired, Math.max(0, sessionExpiresAt - Date.now()));
    document.addEventListener("visibilitychange", lockIfExpired);
    return () => {
      window.clearTimeout(timeout);
      document.removeEventListener("visibilitychange", lockIfExpired);
    };
  }, [currentUser, sessionExpiresAt]);

  const activeMembers = members.filter(member => member.active);
  const filtered = expenses.filter(expense => expense.date.startsWith(month));
  const filteredSettlements = settlements.filter(settlement => settlement.date.startsWith(month));
  const balances = useMemo(() => {
    const result: Record<string, number> = Object.fromEntries(members.map(member => [member.id, 0]));
    filtered.forEach(expense => {
      if (!expense.participants.length) return;
      const share = expense.amount / expense.participants.length;
      result[expense.paidBy] = (result[expense.paidBy] ?? 0) + expense.amount;
      expense.participants.forEach(id => { result[id] = (result[id] ?? 0) - share; });
    });
    filteredSettlements.forEach(settlement => {
      result[settlement.from] = (result[settlement.from] ?? 0) + settlement.amount;
      result[settlement.to] = (result[settlement.to] ?? 0) - settlement.amount;
    });
    return result;
  }, [filtered, filteredSettlements, members]);
  const total = filtered.reduce((sum, expense) => sum + expense.amount, 0);
  const balanceMembers = members.filter(member => member.active || Math.abs(balances[member.id] ?? 0) > 0.001);
  const incomingPending = settlementRequests.filter(request => request.to === currentUser?.id && request.status === "pending");

  async function login(event: FormEvent) {
    event.preventDefault();
    if (!loginMember) return;
    try {
      await action("login", { memberId: loginMember.id, pin });
      setLoginMember(null); setPin(""); setView("dashboard");
      await loadState();
    } catch { /* notice is shown above the form */ }
  }

  async function setupAdministrator(event: FormEvent) {
    event.preventDefault();
    if (!setupName.trim() || setupPin.length !== 4 || !setupKey.trim()) return;
    setSetupBusy(true);
    try {
      await action("bootstrapAdmin", { name: setupName.trim(), pin: setupPin, setupKey: setupKey.trim() });
      setSetupName(""); setSetupPin(""); setSetupKey("");
      setNotice("Administrator created. Select your profile and enter your PIN to sign in.");
    } catch { /* notice is shown above the form */ }
    finally { setSetupBusy(false); }
  }

  async function logout() {
    try { await action("logout"); } catch { /* local lock still applies */ }
    clearSessionCredentials();
    setSessionExpiresAt(null);
    setCurrentUser(null);
    setExpenses([]); setSettlements([]); setSettlementRequests([]);
    setLoginMember(null); setPin(""); setView("dashboard");
    setShowExpense(false); setShowSettle(false); setShowNotifications(false); setHistoryMember(null);
    await loadState();
  }

  if (showLaunch) return <LaunchScreen />;
  if (loading) return <main className="login-shell"><div className="loading-card"><BrandMark /><strong>Opening FlatLedger2…</strong></div></main>;
  if (!currentUser) return <main className="login-shell"><section className="login-card">
    <div className="brand"><BrandMark /><span>FlatLedger2</span></div>
    {!loginMember ? <>
      <div className="login-copy"><span className="eyebrow">SHARED FLAT · {activeMembers.length} MEMBERS</span><h1>{activeMembers.length ? <>Who’s adding<br />an expense?</> : "Set up your group"}</h1><p>{activeMembers.length ? "Select your profile to continue." : "Create the first administrator to get started."}</p></div>
      {notice && <p className="alert">{notice}</p>}
      <div className="member-grid">{activeMembers.map(member => <button className="member-tile" key={member.id} onClick={() => { setLoginMember(member); setNotice(""); }}><span className="avatar" style={{ background: member.color }}>{member.name.slice(0, 1)}</span><span><strong>{member.name}</strong><small>{member.isAdmin ? "Administrator" : "Tap to sign in"}</small></span></button>)}</div>
      {activeMembers.length === 0 && <form className="setup-admin" onSubmit={setupAdministrator}>
        <label>Your name<input autoComplete="name" maxLength={80} value={setupName} onChange={event => setSetupName(event.target.value)} placeholder="Administrator name" /></label>
        <label>Your four-digit PIN<input inputMode="numeric" autoComplete="new-password" type="password" maxLength={4} value={setupPin} onChange={event => setSetupPin(event.target.value.replace(/\D/g, ""))} placeholder="4-digit PIN" /></label>
        <label>One-time setup code<input autoComplete="off" type="password" value={setupKey} onChange={event => setSetupKey(event.target.value)} placeholder="Code provided to the owner" /></label>
        <button className="primary" disabled={setupBusy || !setupName.trim() || setupPin.length !== 4 || !setupKey.trim()}>{setupBusy ? "Creating…" : "Create administrator"}</button>
      </form>}
      <p className="demo-note">PIN protected · Automatically locks after 30 minutes</p>
    </> : <form className="pin-form" onSubmit={login}>
      <button type="button" className="back" onClick={() => { setLoginMember(null); setPin(""); setNotice(""); }}>← All profiles</button>
      <span className="avatar big" style={{ background: loginMember.color }}>{loginMember.name.slice(0, 1)}</span>
      <h1>Welcome, {loginMember.name}</h1><p>Enter your four-digit PIN</p>
      <input autoFocus inputMode="numeric" maxLength={4} value={pin} onChange={event => setPin(event.target.value.replace(/\D/g, ""))} placeholder="••••" aria-label="Four digit PIN" />
      {notice && <p className="error">{notice}</p>}
      <button className="primary" disabled={pin.length !== 4}>Continue</button>
    </form>}
  </section></main>;

  const navItems: [View, string, string][] = [["dashboard", "Overview", "⌂"], ["expenses", "Expenses", "↗"], ["reports", "Monthly report", "▤"]];
  if (currentUser.isAdmin) navItems.push(["settings", "Members & PINs", "⚙"]);

  return <main className="app-shell">
    <aside><div className="brand"><BrandMark /><span>FlatLedger2</span></div><nav>{navItems.map(([id, label, icon]) => <button key={id} className={view === id ? "active" : ""} onClick={() => setView(id)}><span>{icon}</span>{label}</button>)}<button type="button" className="mobile-logout" aria-label="Sign out" title="Sign out" onClick={() => void logout()}><span>↪</span>Sign out</button></nav><div className="profile"><span className="avatar mini" style={{ background: currentUser.color }}>{currentUser.name[0]}</span><div><strong>{currentUser.name}</strong><small>{currentUser.isAdmin ? "Administrator" : "Signed in"}</small></div><button aria-label="Sign out" onClick={() => void logout()}>↪</button></div></aside>
    <section className="content">
      <header><div><span className="eyebrow">SHARED HOME FINANCES</span><h1>{view === "dashboard" ? `${greeting}, ${currentUser.name}` : view === "expenses" ? "All expenses" : view === "reports" ? "Monthly report" : "Members & PINs"}</h1><p>{view === "dashboard" ? "Everyone sees the same shared figures." : "Everything stays clear and accountable."}</p></div><div className="header-actions"><button type="button" className="notification-button" aria-label={`Payment notifications${incomingPending.length ? `, ${incomingPending.length} pending` : ""}`} onClick={() => setShowNotifications(true)}>♢{incomingPending.length > 0 && <span>{incomingPending.length}</span>}</button><input type="month" value={month} onChange={event => setMonth(event.target.value)} /><button className="primary" onClick={() => { setEditingExpense(null); setShowExpense(true); }}>＋ Add expense</button></div></header>
      {notice && <div className="alert">{notice}</div>}
      {incomingPending.length > 0 && <button type="button" className="payment-notice" onClick={() => setShowNotifications(true)}><span>!</span><div><strong>{incomingPending.length} payment confirmation{incomingPending.length === 1 ? "" : "s"} waiting</strong><small>Review and accept or reject the reported settlement.</small></div><b>Review</b></button>}

      {view === "dashboard" && <><div className="stat-grid"><article className="stat purple"><span>THIS MONTH</span><strong>{money(total)}</strong><small>{filtered.length} shared expenses</small></article><article className="stat"><span>YOUR BALANCE</span><strong className={(balances[currentUser.id] ?? 0) >= 0 ? "positive" : "negative"}>{(balances[currentUser.id] ?? 0) >= 0 ? "+" : "−"}{money(balances[currentUser.id] ?? 0)}</strong><small>{(balances[currentUser.id] ?? 0) >= 0 ? "You are owed" : "You owe the flat"}</small></article><article className="stat"><span>AVERAGE / ACTIVE MEMBER</span><strong>{money(total / Math.max(activeMembers.length, 1))}</strong><small>Across {activeMembers.length} current members</small></article></div><div className="dashboard-grid"><article className="panel"><div className="panel-head"><div><h2>Everyone’s balance</h2><p>Click a member to view history shared with you</p></div><button onClick={() => setShowSettle(true)}>Settle up</button></div><div className="balance-list">{balanceMembers.map(member => <button type="button" className="balance-row balance-row-button" key={member.id} onClick={() => setHistoryMember(member)} aria-label={`View ${member.name}'s history shared with you`}><span className="avatar mini" style={{ background: member.color }}>{member.name[0]}</span><span className="balance-name"><strong>{member.name}{member.active ? "" : " (Former)"}</strong><small>{(balances[member.id] ?? 0) >= 0 ? "gets back" : "needs to pay"} · View shared history</small></span><strong className={(balances[member.id] ?? 0) >= 0 ? "positive" : "negative"}>{(balances[member.id] ?? 0) >= 0 ? "+" : "−"}{money(balances[member.id] ?? 0)}</strong><span className="history-arrow" aria-hidden="true">›</span></button>)}</div></article><article className="panel"><div className="panel-head"><div><h2>Recent expenses</h2><p>Synced from the shared database</p></div><button onClick={() => setView("expenses")}>View all</button></div><ExpenseList expenses={filtered.slice(-5).reverse()} members={members} /></article></div></>}

      {view === "expenses" && <article className="panel wide"><div className="panel-head"><div><h2>{new Date(month + "-02").toLocaleDateString("en", { month: "long", year: "numeric" })}</h2><p>{filtered.length} entries · {money(total)} total</p></div></div><ExpenseList expenses={filtered.slice().reverse()} members={members} currentUser={currentUser} onEdit={expense => { setEditingExpense(expense); setShowExpense(true); }} onDelete={async id => { await action("deleteExpense", { id }); }} /></article>}

      {view === "reports" && <article className="panel wide report"><div className="report-title"><div><span className="eyebrow">MONTHLY SUMMARY</span><h2>{new Date(month + "-02").toLocaleDateString("en", { month: "long", year: "numeric" })}</h2></div><button onClick={() => window.print()}>Print / Save PDF</button></div><div className="report-total"><span>Total flat spending</span><strong>{money(total)}</strong></div><h3>Member breakdown</h3>{balanceMembers.map(member => <div className="report-row" key={member.id}><span>{member.name}{member.active ? "" : " (Former member)"}</span><strong className={(balances[member.id] ?? 0) >= 0 ? "positive" : "negative"}>{(balances[member.id] ?? 0) >= 0 ? "is owed " : "owes "}{money(balances[member.id] ?? 0)}</strong></div>)}</article>}

      {view === "settings" && currentUser.isAdmin && <article className="panel wide"><div className="panel-head"><div><h2>Current flat members</h2><p>Only an administrator can add, edit, remove or restore members.</p></div><span className="admin-badge">ADMIN ONLY</span></div><div className="settings-list">{activeMembers.map(member => <MemberEditor key={member.id} member={member} onSave={async (name, pin) => { await action("updateMember", { id: member.id, name, pin }); }} onRemove={member.isAdmin ? undefined : async () => { await action("toggleMember", { id: member.id, active: false }); }} />)}</div><form className="add-member" onSubmit={async event => { event.preventDefault(); try { await action("addMember", { name: newMemberName, pin: newMemberPin }); setNewMemberName(""); setNewMemberPin(""); } catch { /* notice shown */ } }}><div><h3>Add a new member</h3><p>They receive a secure shared account.</p></div><input aria-label="New member name" value={newMemberName} onChange={event => setNewMemberName(event.target.value)} placeholder="Member name" /><input aria-label="New member PIN" inputMode="numeric" maxLength={4} value={newMemberPin} onChange={event => setNewMemberPin(event.target.value.replace(/\D/g, ""))} placeholder="4-digit PIN" /><button className="primary" disabled={!newMemberName.trim() || newMemberPin.length !== 4}>＋ Add member</button></form>{members.some(member => !member.active) && <div className="former-members"><h3>Former members</h3><p>Their historical expenses remain intact.</p>{members.filter(member => !member.active).map(member => <div key={member.id}><span className="avatar tiny" style={{ background: member.color }}>{member.name[0]}</span><span>{member.name}</span><button onClick={() => void action("toggleMember", { id: member.id, active: true })}>Restore</button></div>)}</div>}</article>}
    </section>

    {showExpense && <ExpenseModal members={editingExpense ? members.filter(member => member.active || editingExpense.participants.includes(member.id) || editingExpense.paidBy === member.id) : activeMembers} active={currentUser} expense={editingExpense} onClose={() => { setShowExpense(false); setEditingExpense(null); }} onSave={async expense => { await action("saveExpense", { expense }); setShowExpense(false); setEditingExpense(null); }} />}
    {showSettle && activeMembers.length > 1 && <SettleModal members={activeMembers} active={currentUser} currentBalance={balances[currentUser.id] ?? 0} month={month} onClose={() => setShowSettle(false)} onSave={async settlement => { await action("addSettlement", { settlement }); const recipient = members.find(member => member.id === settlement.to); setShowSettle(false); setNotice(`${monthLabel(settlement.settlementMonth)} confirmation request sent to ${recipient?.name ?? "the recipient"}. Only that month’s balance will update after acceptance.`); }} />}
    {showNotifications && <NotificationsModal requests={settlementRequests} members={members} currentUser={currentUser} onClose={() => setShowNotifications(false)} onRespond={async (id, decision) => { await action("respondSettlement", { id, decision }); setNotice(decision === "accepted" ? "Payment confirmed. The settlement is now included in everyone’s balance." : "Payment request rejected. No balance was changed."); }} />}
    {historyMember && <MemberHistoryModal member={historyMember} viewer={currentUser} members={members} expenses={expenses} settlements={settlements} onClose={() => setHistoryMember(null)} />}
  </main>;
}

function MemberEditor({ member, onSave, onRemove }: { member: Member; onSave: (name: string, pin: string) => Promise<void>; onRemove?: () => Promise<void> }) {
  const [name, setName] = useState(member.name); const [pin, setPin] = useState(""); const [saving, setSaving] = useState(false);
  return <div className="setting-row"><span className="avatar mini" style={{ background: member.color }}>{member.name[0]}</span><input aria-label={`${member.name} name`} value={name} onChange={event => setName(event.target.value)} /><input aria-label={`New PIN for ${member.name}`} inputMode="numeric" maxLength={4} value={pin} onChange={event => setPin(event.target.value.replace(/\D/g, ""))} placeholder="New PIN (optional)" /><button className="save-member" disabled={saving || !name.trim() || (pin.length > 0 && pin.length !== 4)} onClick={async () => { setSaving(true); try { await onSave(name, pin); setPin(""); } finally { setSaving(false); } }}>{saving ? "Saving…" : "Save"}</button>{onRemove ? <button className="remove-member" onClick={() => void onRemove()}>Remove</button> : <span className="owner-label">Owner</span>}</div>;
}

function ExpenseList({ expenses, members, currentUser, onEdit, onDelete }: { expenses: Expense[]; members: Member[]; currentUser?: CurrentUser; onEdit?: (expense: Expense) => void; onDelete?: (id: string) => Promise<void> }) {
  if (!expenses.length) return <div className="empty"><span>⌁</span><strong>No expenses yet</strong><p>Add the first expense to begin this month.</p></div>;
  return <div className="expense-list">{expenses.map(expense => { const payer = members.find(member => member.id === expense.paidBy); const canChange = currentUser?.isAdmin || currentUser?.id === expense.createdBy; return <div className="expense-row" key={expense.id}><span className="expense-icon">{expense.category === "Food" ? "🍲" : expense.category === "Bills" ? "⚡" : expense.category === "Rent" ? "⌂" : "◈"}</span><div><strong>{expense.title}</strong><small>{new Date(expense.date + "T12:00").toLocaleDateString("en", { day: "numeric", month: "short" })} · {expense.participants.length} participants · paid by {payer?.name ?? "Former member"}</small><small className="expense-entry-time">{entryTimestamp(expense.createdAt)}</small></div><strong>{money(expense.amount)}</strong>{canChange && onEdit && <button className="edit-expense" aria-label={`Edit ${expense.title}`} onClick={() => onEdit(expense)}>✎</button>}{canChange && onDelete && <button className="delete" aria-label={`Delete ${expense.title}`} onClick={() => void onDelete(expense.id)}>×</button>}</div>; })}</div>;
}

function MemberHistoryModal({ member, viewer, members, expenses, settlements, onClose }: { member: Member; viewer: CurrentUser; members: Member[]; expenses: Expense[]; settlements: Settlement[]; onClose: () => void }) {
  const memberName = (id: string) => members.find(item => item.id === id)?.name ?? "Former member";
  const ownProfile = member.id === viewer.id;
  const relevantExpenses = expenses.filter(expense => expense.paidBy === member.id && (ownProfile || expense.participants.includes(viewer.id)));
  const relevantSettlements = settlements.filter(settlement => settlement.from === member.id && (ownProfile || settlement.to === viewer.id));
  const items: HistoryItem[] = [
    ...relevantExpenses.map(expense => ({ id: `expense-${expense.id}`, date: expense.date, title: expense.title, detail: `Paid for ${expense.participants.length} participant${expense.participants.length === 1 ? "" : "s"} · ${entryTimestamp(expense.createdAt)}`, amount: expense.amount, icon: expense.category === "Food" ? "🍲" : expense.category === "Bills" ? "⚡" : expense.category === "Rent" ? "⌂" : "◈" })),
    ...relevantSettlements.map(settlement => ({ id: `settlement-${settlement.id}`, date: settlement.date, title: `Paid settlement to ${memberName(settlement.to)}`, detail: "Settlement sent", amount: settlement.amount, icon: "↗", direction: "negative" as const })),
  ].sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
  const grouped = items.reduce<Record<string, HistoryItem[]>>((result, item) => {
    (result[item.date] ??= []).push(item);
    return result;
  }, {});
  const totalPaid = relevantExpenses.reduce((sum, expense) => sum + expense.amount, 0);
  const settlementsSent = relevantSettlements.reduce((sum, settlement) => sum + settlement.amount, 0);

  return <div className="modal-backdrop" onMouseDown={onClose}><section className="modal history-modal" role="dialog" aria-modal="true" aria-labelledby="member-history-title" onMouseDown={event => event.stopPropagation()}><div className="modal-head"><div><span className="eyebrow">READ-ONLY · {ownProfile ? "PAYMENT HISTORY" : "SHARED HISTORY"}</span><h2 id="member-history-title">{member.name}</h2><p>{ownProfile ? "Your expenses paid and settlements sent, newest first." : `Only expenses and settlements involving you and ${member.name}.`}</p></div><button type="button" aria-label="Close history" onClick={onClose}>×</button></div><div className="history-profile"><span className="avatar" style={{ background: member.color }}>{member.name[0]}</span><div><strong>{member.name}</strong><small>{ownProfile ? "Your complete payment history" : `Only entries shared with ${viewer.name}`} · No editing access here</small></div></div><div className="history-summary"><article><span>{ownProfile ? "Total expenses paid" : "Shared expenses paid"}</span><strong>{money(totalPaid)}</strong></article><article><span>{ownProfile ? "Expense entries" : "Shared entries"}</span><strong>{relevantExpenses.length}</strong></article><article><span>{ownProfile ? "Settlements sent" : "Direct settlements"}</span><strong>{money(settlementsSent)}</strong></article></div>{items.length ? <div className="history-timeline">{Object.entries(grouped).map(([date, dayItems]) => <section className="history-day" key={date}><h3>{new Date(date + "T12:00").toLocaleDateString("en-PK", { weekday: "short", day: "numeric", month: "long", year: "numeric" })}</h3>{dayItems.map(item => <div className="history-item" key={item.id}><span className="history-item-icon">{item.icon}</span><div><strong>{item.title}</strong><small>{item.detail}</small></div><strong className={item.direction}>{item.direction === "positive" ? "+" : item.direction === "negative" ? "−" : ""}{money(item.amount)}</strong></div>)}</section>)}</div> : <div className="empty"><span>⌁</span><strong>No shared payment history</strong><p>{ownProfile ? "You have not paid an expense or sent a settlement yet." : `${member.name} has no expenses or settlements shared directly with you.`}</p></div>}</section></div>;
}

function ExpenseModal({ members, active, expense, onClose, onSave }: { members: Member[]; active: CurrentUser; expense: Expense | null; onClose: () => void; onSave: (expense: Expense) => Promise<void> }) {
  const [title, setTitle] = useState(expense?.title ?? ""); const [amount, setAmount] = useState(expense ? String(expense.amount) : ""); const [category, setCategory] = useState(expense?.category ?? "Food"); const paidBy = expense?.paidBy ?? active.id; const payer = members.find(member => member.id === paidBy) ?? active; const [participants, setParticipants] = useState(expense?.participants ?? members.map(member => member.id)); const [date, setDate] = useState(expense?.date ?? new Date().toISOString().slice(0, 10)); const [saving, setSaving] = useState(false);
  async function submit(event: FormEvent) { event.preventDefault(); if (!title.trim() || !amount || !participants.length) return; setSaving(true); try { await onSave({ id: expense?.id ?? makeId(), title: title.trim(), amount: Number(amount), category, paidBy, participants, date, createdBy: expense?.createdBy ?? active.id }); } finally { setSaving(false); } }
  return <div className="modal-backdrop" onMouseDown={onClose}><form className="modal" onSubmit={submit} onMouseDown={event => event.stopPropagation()}><div className="modal-head"><div><span className="eyebrow">{expense ? "CORRECT ENTRY" : "NEW ENTRY"}</span><h2>{expense ? "Edit expense" : "Add an expense"}</h2></div><button type="button" onClick={onClose}>×</button></div><label>What was it for?<input autoFocus value={title} onChange={event => setTitle(event.target.value)} placeholder="e.g. Sunday dinner" /></label><div className="two-col"><label>Amount (PKR)<input type="number" min="1" value={amount} onChange={event => setAmount(event.target.value)} placeholder="0" /></label><label>Category<select value={category} onChange={event => setCategory(event.target.value)}><option>Food</option><option>Bills</option><option>Rent</option><option>Groceries</option><option>Cleaning</option><option>Other</option></select></label></div><div className="two-col"><label>Paid by<div className="locked-payer"><span className="avatar tiny" style={{ background: payer.color }}>{payer.name[0]}</span><span><strong>{payer.name}</strong><small>{expense ? "Original payer cannot be changed" : "Signed-in member"}</small></span><i>LOCKED</i></div></label><label>Date<input type="date" value={date} onChange={event => setDate(event.target.value)} /></label></div><fieldset><legend>Who participated?</legend><p>Select only the people sharing this expense.</p><div className="participant-grid">{members.map(member => <button type="button" key={member.id} className={participants.includes(member.id) ? "selected" : ""} onClick={() => setParticipants(participants.includes(member.id) ? participants.filter(id => id !== member.id) : [...participants, member.id])}><span className="avatar tiny" style={{ background: member.color }}>{member.name[0]}</span>{member.name}<i>{participants.includes(member.id) ? "✓" : ""}</i></button>)}</div></fieldset><div className="split-preview"><span>Split between {participants.length} people</span><strong>{participants.length && amount ? money(Number(amount) / participants.length) + " each" : "—"}</strong></div><button className="primary full" disabled={saving}>{saving ? "Saving…" : expense ? "Save changes" : "Save expense"}</button></form></div>;
}

function SettleModal({ members, active, currentBalance, month, onClose, onSave }: { members: Member[]; active: CurrentUser; currentBalance: number; month: string; onClose: () => void; onSave: (settlement: { to: string; amount: number; paymentMethod: PaymentMethod; settlementMonth: string }) => Promise<void> }) {
  const [to, setTo] = useState(members.find(member => member.id !== active.id)?.id ?? ""); const [amount, setAmount] = useState(""); const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("Cash"); const [saving, setSaving] = useState(false);
  return <div className="modal-backdrop" onMouseDown={onClose}><form className="modal small" onSubmit={async event => { event.preventDefault(); if (!amount || !to) return; setSaving(true); try { await onSave({ to, amount: Number(amount), paymentMethod, settlementMonth: month }); } finally { setSaving(false); } }} onMouseDown={event => event.stopPropagation()}><div className="modal-head"><div><span className="eyebrow">REQUEST PAYMENT CONFIRMATION</span><h2>Settle up</h2></div><button type="button" onClick={onClose}>×</button></div><div className="balance-preview"><span>Your balance · {monthLabel(month)}</span><strong className={currentBalance >= 0 ? "positive" : "negative"}>{currentBalance >= 0 ? "+" : "−"}{money(currentBalance)}</strong><small>{currentBalance >= 0 ? "You are currently owed" : "You currently owe the flat"}</small></div><label>You paid<select value={to} onChange={event => setTo(event.target.value)}>{members.filter(member => member.id !== active.id).map(member => <option key={member.id} value={member.id}>{member.name}</option>)}</select></label><label>Amount (PKR)<input autoFocus type="number" min="1" value={amount} onChange={event => setAmount(event.target.value)} placeholder="0" /></label><label>Payment method<select value={paymentMethod} onChange={event => setPaymentMethod(event.target.value as PaymentMethod)}><option value="Cash">Cash</option><option value="Online">Online</option></select></label><p className="confirmation-note">This payment will settle {monthLabel(month)} only. The recipient must confirm it before balances change.</p><button className="primary full" disabled={saving || !amount || !to}>{saving ? "Sending…" : "Record settlement"}</button></form></div>;
}

function NotificationsModal({ requests, members, currentUser, onClose, onRespond }: { requests: SettlementRequest[]; members: Member[]; currentUser: CurrentUser; onClose: () => void; onRespond: (id: string, decision: "accepted" | "rejected") => Promise<void> }) {
  const [respondingId, setRespondingId] = useState("");
  const memberName = (id: string) => members.find(member => member.id === id)?.name ?? "Former member";
  async function respond(id: string, decision: "accepted" | "rejected") {
    setRespondingId(id);
    try { await onRespond(id, decision); } finally { setRespondingId(""); }
  }
  return <div className="modal-backdrop" onMouseDown={onClose}><section className="modal notification-modal" role="dialog" aria-modal="true" aria-labelledby="notifications-title" onMouseDown={event => event.stopPropagation()}><div className="modal-head"><div><span className="eyebrow">PAYMENT CONFIRMATIONS</span><h2 id="notifications-title">Notifications</h2><p>Confirm only payments you have actually received.</p></div><button type="button" onClick={onClose}>×</button></div>{requests.length ? <div className="notification-list">{requests.map(request => { const incoming = request.to === currentUser.id; const otherName = memberName(incoming ? request.from : request.to); return <article className={`notification-row ${request.status}`} key={request.id}><div className="notification-row-head"><span className="notification-symbol">{incoming ? "↓" : "↑"}</span><div><strong>{incoming ? `${otherName} reported a payment to you` : `You reported a payment to ${otherName}`}</strong><small>{new Date(request.createdAt).toLocaleString("en-PK", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Karachi" })}</small></div><span className={`status-badge ${request.status}`}>{request.status}</span></div><div className="notification-details"><span>{money(request.amount)}</span><span>{request.paymentMethod}</span><span>{monthLabel(request.targetMonth)}</span></div>{incoming && request.status === "pending" && <div className="notification-actions"><button type="button" className="reject-payment" disabled={respondingId === request.id} onClick={() => void respond(request.id, "rejected")}>Reject</button><button type="button" className="accept-payment" disabled={respondingId === request.id} onClick={() => void respond(request.id, "accepted")}>{respondingId === request.id ? "Saving…" : "Accept payment"}</button></div>}{!incoming && request.status === "pending" && <p className="waiting-copy">Waiting for {otherName} to confirm.</p>}{request.status === "accepted" && <p className="accepted-copy">Confirmed and included in the {monthLabel(request.targetMonth)} balance.</p>}{request.status === "rejected" && <p className="rejected-copy">Rejected — balances were not changed.</p>}</article>; })}</div> : <div className="empty"><span>◇</span><strong>No payment notifications</strong><p>New settlement requests and their status will appear here.</p></div>}</section></div>;
}
