export function toCents(value) {
  return Math.round(Number(value) * 100)
}

export function centsToUsd(cents) {
  return (Number(cents) / 100).toFixed(2)
}

export function isHexAddress(value) {
  return /^0x[a-fA-F0-9]{40}$/.test(String(value || "").trim())
}

export function resolveMockAddress(identifier) {
  const text = String(identifier || "").trim().toLowerCase()
  if (isHexAddress(text)) return text
  let hash = 0
  for (let i = 0; i < text.length; i += 1) hash = (hash * 31 + text.charCodeAt(i)) >>> 0
  const seg = hash.toString(16).padStart(8, "0")
  return `0x${seg}${seg}${seg}${seg}${seg}`.slice(0, 42)
}

export function memoToBytes32Hex(value) {
  const bytes = new TextEncoder().encode(String(value || ""))
  const sliced = bytes.slice(0, 32)
  let hex = ""
  for (const byte of sliced) hex += byte.toString(16).padStart(2, "0")
  return `0x${hex.padEnd(64, "0")}`
}

export function toTokenUnitsFromCents(cents, decimals = 6) {
  return (BigInt(cents) * 10n ** BigInt(decimals)) / 100n
}

export function computeBalances(members, expenses) {
  const balances = new Map(members.map((m) => [m.id, 0]))

  for (const exp of expenses) {
    const participants = exp.participantIds
    if (!participants.length) continue

    const baseShare = Math.floor(exp.amountCents / participants.length)
    const remainder = exp.amountCents % participants.length

    balances.set(exp.payerId, (balances.get(exp.payerId) || 0) + exp.amountCents)

    participants.forEach((memberId, idx) => {
      const share = baseShare + (idx < remainder ? 1 : 0)
      balances.set(memberId, (balances.get(memberId) || 0) - share)
    })
  }

  return balances
}

export function settlementPlan(balanceMap) {
  const debtors = []
  const creditors = []

  for (const [memberId, cents] of balanceMap.entries()) {
    if (cents < 0) debtors.push({ memberId, cents: -cents })
    if (cents > 0) creditors.push({ memberId, cents })
  }

  debtors.sort((a, b) => b.cents - a.cents)
  creditors.sort((a, b) => b.cents - a.cents)

  const transfers = []
  let i = 0
  let j = 0

  while (i < debtors.length && j < creditors.length) {
    const d = debtors[i]
    const c = creditors[j]
    const amount = Math.min(d.cents, c.cents)

    transfers.push({ from: d.memberId, to: c.memberId, amountCents: amount })

    d.cents -= amount
    c.cents -= amount
    if (d.cents === 0) i += 1
    if (c.cents === 0) j += 1
  }

  return transfers
}
