// Balances, pairwise debts and debt simplification. All amounts are in the group currency.

/** Net per person: positive = the group owes them, negative = they owe the group. */
export function groupNets(st, gid) {
  const g = st.groups[gid];
  const n = {};
  for (const u of g.everMembers) n[u] = 0;
  for (const x of Object.values(st.expenses)) {
    if (x.gid !== gid || x.deleted) continue;
    for (const u in x.paid) n[u] = (n[u] || 0) + x.paid[u];
    for (const u in x.owed) n[u] = (n[u] || 0) - x.owed[u];
  }
  for (const s of Object.values(st.settlements)) {
    if (s.gid !== gid || s.status !== 'confirmed') continue;
    n[s.from] = (n[s.from] || 0) + s.amt;
    n[s.to] = (n[s.to] || 0) - s.amt;
  }
  return n;
}

/** Match debtors to creditors, largest first. Deterministic for equal amounts (by id). */
function greedy(nets) {
  const cr = [];
  const db = [];
  for (const id of Object.keys(nets).sort()) {
    if (nets[id] > 0) cr.push([id, nets[id]]);
    else if (nets[id] < 0) db.push([id, -nets[id]]);
  }
  const cmp = (a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1);
  cr.sort(cmp);
  db.sort(cmp);
  const out = [];
  let i = 0;
  let j = 0;
  while (i < cr.length && j < db.length) {
    const amt = Math.min(cr[i][1], db[j][1]);
    out.push({ from: db[j][0], to: cr[i][0], amt });
    cr[i][1] -= amt;
    db[j][1] -= amt;
    if (cr[i][1] === 0) i++;
    if (db[j][1] === 0) j++;
  }
  return out;
}

/** Fewest transfers that settle everyone (greedy; never more than n−1 payments). */
export function simplifyDebts(nets) {
  return greedy(nets);
}

/** Who owes whom without simplifying: debts stay between the people in each expense. */
export function pairwiseDebts(st, gid) {
  const pair = new Map();
  const add = (a, b, v) => {
    const k = a + '|' + b;
    pair.set(k, (pair.get(k) || 0) + v);
  };
  for (const x of Object.values(st.expenses)) {
    if (x.gid !== gid || x.deleted) continue;
    const nets = {};
    for (const u in x.paid) nets[u] = (nets[u] || 0) + x.paid[u];
    for (const u in x.owed) nets[u] = (nets[u] || 0) - x.owed[u];
    for (const t of greedy(nets)) add(t.from, t.to, t.amt);
  }
  for (const s of Object.values(st.settlements)) {
    if (s.gid !== gid || s.status !== 'confirmed') continue;
    add(s.from, s.to, -s.amt);
  }
  const ids = new Set();
  for (const k of pair.keys()) k.split('|').forEach((id) => ids.add(id));
  const sorted = [...ids].sort();
  const out = [];
  for (let i = 0; i < sorted.length; i++) {
    for (let j = i + 1; j < sorted.length; j++) {
      const a = sorted[i];
      const b = sorted[j];
      const d = (pair.get(a + '|' + b) || 0) - (pair.get(b + '|' + a) || 0);
      if (d > 0) out.push({ from: a, to: b, amt: d });
      else if (d < 0) out.push({ from: b, to: a, amt: -d });
    }
  }
  return out.sort((x, y) => y.amt - x.amt || (x.from < y.from ? -1 : 1));
}

/** The repayments the group shows, honouring its "simplify debts" setting. */
export function groupTransfers(st, gid) {
  const g = st.groups[gid];
  return g.simplify ? simplifyDebts(groupNets(st, gid)) : pairwiseDebts(st, gid);
}

/** Money still waiting on the receiver's confirmation, so it is not counted yet. */
export function pendingFor(st, gid) {
  return Object.values(st.settlements).filter((s) => s.gid === gid && s.status === 'pending');
}

/**
 * Per-friend balance across all groups, from my point of view.
 * Returns { uid: { byCur: {INR: +owedToMe / −iOwe}, groups: {gid: amt} } }.
 */
export function friendBalances(st, me) {
  const out = {};
  for (const g of Object.values(st.groups)) {
    if (!g.everMembers.includes(me)) continue;
    for (const u of g.everMembers) if (u !== me) (out[u] ||= { byCur: {}, groups: {}, shared: new Set() }).shared.add(g.id);
    for (const t of groupTransfers(st, g.id)) {
      let other;
      let v;
      if (t.to === me) { other = t.from; v = t.amt; } else if (t.from === me) { other = t.to; v = -t.amt; } else continue;
      const f = (out[other] ||= { byCur: {}, groups: {}, shared: new Set() });
      f.byCur[g.cur] = (f.byCur[g.cur] || 0) + v;
      f.groups[g.id] = (f.groups[g.id] || 0) + v;
    }
  }
  return out;
}

/** My totals across groups, per currency: { owed: {INR: n}, owe: {INR: n} } */
export function myTotals(st, me) {
  const owed = {};
  const owe = {};
  for (const g of Object.values(st.groups)) {
    if (!g.everMembers.includes(me)) continue;
    const v = groupNets(st, g.id)[me] || 0;
    if (v > 0) owed[g.cur] = (owed[g.cur] || 0) + v;
    if (v < 0) owe[g.cur] = (owe[g.cur] || 0) - v;
  }
  return { owed, owe };
}

/** What an expense means for me: + I lent, − I borrowed, 0 not involved / even. */
export function myShare(x, me) {
  return (x.paid[me] || 0) - (x.owed[me] || 0);
}

export function isInvolved(x, me) {
  return !!(x.paid[me] || x.owed[me]);
}

/** Spending summary for charts. */
export function groupTotals(st, gid, me) {
  const byCat = {};
  const byMonth = {};
  let total = 0;
  let myCost = 0;
  let myPaid = 0;
  for (const x of Object.values(st.expenses)) {
    if (x.gid !== gid || x.deleted) continue;
    total += x.base;
    myCost += x.owed[me] || 0;
    myPaid += x.paid[me] || 0;
    byCat[x.cat] = (byCat[x.cat] || 0) + x.base;
    const m = x.date.slice(0, 7);
    byMonth[m] = (byMonth[m] || 0) + x.base;
  }
  return { total, myCost, myPaid, byCat, byMonth };
}
