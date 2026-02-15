import React, { useEffect, useMemo, useState } from "react"
import {
  centsToUsd,
  computeBalances,
  isHexAddress,
  memoToBytes32Hex,
  resolveMockAddress,
  settlementPlan,
  toCents,
  toTokenUnitsFromCents,
} from "./finance.js"

const AUTH_KEY = "tempopilot-auth-v1"
const STORE_KEY = "tempopilot-react-v1"
const THEME_KEY = "tempopilot-theme"

const TOKENS = {
  alpha: "0x20c0000000000000000000000000000000000001",
  beta: "0x20c0000000000000000000000000000000000002",
  theta: "0x20c0000000000000000000000000000000000003",
  path: "0x20c0000000000000000000000000000000000000",
}

const TEMPO = {
  chainId: 42431,
  rpcUrl: "https://rpc.moderato.tempo.xyz",
  network: "Tempo Testnet (Moderato)",
  currency: "USD",
  explorer: "https://explore.tempo.xyz",
}

const DEMO = {
  wallet1: {
    address: "0x031891A61200FedDd622EbACC10734BC90093B2A",
    privateKey: "0x2b9e3b8a095940cf3461e27bfb2bebb498df9a6381b76b9f9c48c9bbdc3c8192",
  },
  wallet2: {
    address: "0xAcF8dBD0352a9D47135DA146EA5DbEfAD58340C4",
    privateKey: "0xf3c009932cfe5e0b20db6c959e28e3546047cf70309d0f2ac5d38ee14527739a",
  },
  wallet3: {
    address: "0x41A75fc9817AF9F2DB0c0e58C71Bc826339b3Acb",
    privateKey: "0xf804bb2ff55194ce6a62de31219d08fff6fd67fbaa68170e3dc8234035cad108",
  },
}

const TOKEN_ABI = [
  {
    type: "function",
    name: "transferWithMemo",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
      { name: "memo", type: "bytes32" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
]

const defaultMembers = [
  { id: "m1", name: "Ava", identifier: DEMO.wallet1.address },
  { id: "m2", name: "Neil", identifier: DEMO.wallet2.address },
  { id: "m3", name: "Sam", identifier: DEMO.wallet3.address },
]

const defaultExpenses = [
  { id: "e1", desc: "Dinner", amountCents: 12000, payerId: "m1", participantIds: ["m1", "m2", "m3"] },
  { id: "e2", desc: "Cab", amountCents: 4500, payerId: "m2", participantIds: ["m1", "m2", "m3"] },
]

const TOUR = [
  { view: "onboarding", text: "Load a demo wallet, then save and check network." },
  { view: "payments", text: "Send a memo payment with fee sponsorship enabled." },
  { view: "split", text: "Preview and run settlement for current wallet." },
  { view: "swap", text: "Fetch quote, then execute guarded swap." },
  { view: "activity", text: "Show logs + tx links as proof." },
]

function initialState() {
  return {
    view: "dashboard",
    theme: localStorage.getItem(THEME_KEY) || "dark",
    sidebarOpen: false,
    mode: "mock",
    sdk: null,
    rpcUrl: TEMPO.rpcUrl,
    walletKey: "",
    walletAddress: "",
    networkStatus: "Not checked",
    balances: { alpha: null, beta: null },
    members: defaultMembers,
    expenses: defaultExpenses,
    activities: [],
    swap: {
      tokenIn: TOKENS.alpha,
      tokenOut: TOKENS.beta,
      amount: "100",
      slippageBps: 50,
      impactBps: 20,
      lastQuote: null,
    },
  }
}

export default function App() {
  const [auth, setAuth] = useState(() => {
    const raw = localStorage.getItem(AUTH_KEY)
    return safeJson(raw, null)
  })
  const [state, setState] = useState(() => {
    const saved = localStorage.getItem(STORE_KEY)
    const parsed = safeJson(saved, null)
    return parsed ? { ...initialState(), ...parsed } : initialState()
  })

  const [tourIndex, setTourIndex] = useState(-1)
  const [loginIdentifier, setLoginIdentifier] = useState("")
  const [status, setStatus] = useState({ onboarding: "", payment: "", split: "", swap: "" })

  const [newMember, setNewMember] = useState({ name: "", identifier: "" })
  const [newExpense, setNewExpense] = useState({ desc: "", amount: "", payerId: "m1", participants: ["m1", "m2", "m3"] })
  const [payment, setPayment] = useState({ to: "", amount: "", memo: "", feeSponsored: true })

  useEffect(() => {
    document.documentElement.dataset.theme = state.theme
    localStorage.setItem(THEME_KEY, state.theme)
  }, [state.theme])

  useEffect(() => {
    localStorage.setItem(
      STORE_KEY,
      JSON.stringify({
        view: state.view,
        theme: state.theme,
        rpcUrl: state.rpcUrl,
        walletKey: state.walletKey,
        walletAddress: state.walletAddress,
        networkStatus: state.networkStatus,
        balances: state.balances,
        members: state.members,
        expenses: state.expenses,
        activities: state.activities.slice(0, 300),
        swap: state.swap,
      })
    )
  }, [state])

  useEffect(() => {
    if (!auth) return
    initSdk()
  }, [auth])

  async function initSdk() {
    try {
      const [viem, accounts, chains, tempoViem, tempoSdk] = await Promise.all([
        import("https://esm.sh/viem"),
        import("https://esm.sh/viem/accounts"),
        import("https://esm.sh/viem/chains"),
        import("https://esm.sh/viem/tempo"),
        import("https://esm.sh/tempo.ts/viem"),
      ])

      setState((s) => ({
        ...s,
        mode: "live",
        sdk: {
          createClient: viem.createClient,
          http: viem.http,
          parseUnits: viem.parseUnits,
          formatUnits: viem.formatUnits,
          privateKeyToAccount: accounts.privateKeyToAccount,
          tempoChain: chains.tempoModerato || chains.tempoTestnet || chains.tempo,
          tempoActions: tempoViem.tempoActions,
          Actions: tempoSdk.Actions,
        },
      }))
      pushActivity("info", "Tempo SDK loaded. Live mode enabled")
    } catch (error) {
      pushActivity("warn", `SDK unavailable. Mock mode active (${String(error.message || error)})`)
    }
  }

  function pushActivity(level, message, meta = null) {
    setState((s) => ({ ...s, activities: [{ at: Date.now(), level, message, meta }, ...s.activities].slice(0, 300) }))
  }

  function update(partial) {
    setState((s) => ({ ...s, ...partial }))
  }

  function getPublicClient() {
    if (!state.sdk) return null
    return state.sdk
      .createClient({
        chain: state.sdk.tempoChain,
        transport: state.sdk.http(state.rpcUrl),
      })
      .extend(state.sdk.tempoActions())
  }

  function getWalletClient() {
    if (!state.sdk) return null
    const account = state.sdk.privateKeyToAccount(state.walletKey)
    return state.sdk
      .createClient({
        account,
        chain: state.sdk.tempoChain,
        transport: state.sdk.http(state.rpcUrl),
      })
      .extend(state.sdk.tempoActions())
  }

  async function useDemoWallet(key) {
    const w = DEMO[key]
    update({ walletKey: w.privateKey, walletAddress: w.address })
    setStatus((x) => ({ ...x, onboarding: `Loaded ${key}` }))
  }

  async function saveWallet() {
    if (!state.walletKey) {
      update({ walletAddress: "", networkStatus: "No wallet key set", balances: { alpha: null, beta: null } })
      setStatus((x) => ({ ...x, onboarding: "Saved RPC only. Add private key." }))
      return
    }

    if (!/^0x[a-fA-F0-9]{64}$/.test(state.walletKey)) {
      setStatus((x) => ({ ...x, onboarding: "Invalid private key format." }))
      return
    }

    if (state.sdk) {
      try {
        const address = state.sdk.privateKeyToAccount(state.walletKey).address
        update({ walletAddress: address })
      } catch {
        setStatus((x) => ({ ...x, onboarding: "Could not parse private key." }))
        return
      }
    }

    await checkNetwork()
    await refreshBalances()
    setStatus((x) => ({ ...x, onboarding: "Wallet saved." }))
  }

  async function checkNetwork() {
    if (!state.sdk) {
      update({ networkStatus: "Mock mode" })
      return
    }
    try {
      const chainId = await getPublicClient().getChainId()
      update({ networkStatus: chainId === TEMPO.chainId ? `Tempo ${TEMPO.chainId} OK` : `Wrong chain: ${chainId}` })
    } catch {
      update({ networkStatus: "Network check failed" })
    }
  }

  async function refreshBalances() {
    if (!state.walletAddress) return
    if (!state.sdk) {
      update({ balances: { alpha: "1000000.00", beta: "1000000.00" } })
      return
    }

    try {
      const client = getPublicClient()
      const [a, b] = await Promise.all([
        client.readContract({ address: TOKENS.alpha, abi: TOKEN_ABI, functionName: "balanceOf", args: [state.walletAddress] }),
        client.readContract({ address: TOKENS.beta, abi: TOKEN_ABI, functionName: "balanceOf", args: [state.walletAddress] }),
      ])
      update({
        balances: {
          alpha: Number(state.sdk.formatUnits(a, 6)).toFixed(2),
          beta: Number(state.sdk.formatUnits(b, 6)).toFixed(2),
        },
      })
    } catch {
      pushActivity("warn", "Balance fetch failed")
    }
  }

  async function sendPayment(e) {
    e.preventDefault()
    if (!state.walletKey) {
      setStatus((x) => ({ ...x, payment: "Set wallet first." }))
      return
    }

    const amount = Number(payment.amount)
    const toAddress = isHexAddress(payment.to) ? payment.to : resolveMockAddress(payment.to)
    if (!amount || amount <= 0) {
      setStatus((x) => ({ ...x, payment: "Amount should be > 0." }))
      return
    }

    if (!state.sdk) {
      const fakeHash = `0xmock${Date.now().toString(16).padEnd(60, "0")}`
      setStatus((x) => ({ ...x, payment: `Mock payment sent: ${fakeHash}` }))
      pushActivity("warn", `Mock payment $${amount.toFixed(2)} -> ${toAddress}`)
      return
    }

    try {
      const client = getWalletClient()
      const tx = await client.token.transferSync({
        to: toAddress,
        amount: state.sdk.parseUnits(String(amount), 6),
        token: TOKENS.alpha,
        memo: memoToBytes32Hex(payment.memo || "TempoPilot"),
        feePayer: payment.feeSponsored ? true : undefined,
      })
      setStatus((x) => ({ ...x, payment: `Sent: ${tx.receipt.transactionHash}` }))
      pushActivity("info", `Payment $${amount.toFixed(2)} sent`, { tx: tx.receipt.transactionHash })
    } catch (error) {
      setStatus((x) => ({ ...x, payment: `Payment failed: ${error.message || error}` }))
    }
  }

  const balancesMap = useMemo(() => computeBalances(state.members, state.expenses), [state.members, state.expenses])
  const settlePlan = useMemo(() => {
    const map = new Map(state.members.map((m) => [m.id, m]))
    return settlementPlan(balancesMap).map((p) => ({ ...p, from: map.get(p.from), to: map.get(p.to) }))
  }, [balancesMap, state.members])

  function addMember(e) {
    e.preventDefault()
    if (!newMember.name || !newMember.identifier) return
    const member = { id: crypto.randomUUID(), ...newMember }
    update({ members: [...state.members, member] })
    setNewMember({ name: "", identifier: "" })
    pushActivity("info", `Added member ${member.name}`)
  }

  function addExpense(e) {
    e.preventDefault()
    const amountCents = toCents(newExpense.amount)
    if (!newExpense.desc || !amountCents || !newExpense.payerId || !newExpense.participants.length) return
    const expense = {
      id: crypto.randomUUID(),
      desc: newExpense.desc,
      amountCents,
      payerId: newExpense.payerId,
      participantIds: newExpense.participants,
    }
    update({ expenses: [...state.expenses, expense] })
    setNewExpense((s) => ({ ...s, desc: "", amount: "" }))
    pushActivity("info", `Added expense ${expense.desc}`)
  }

  async function runSettlement() {
    if (!state.walletAddress) {
      setStatus((x) => ({ ...x, split: "Set wallet first." }))
      return
    }

    if (!settlePlan.length) {
      setStatus((x) => ({ ...x, split: "Nothing to settle." }))
      return
    }

    let executed = 0

    for (const leg of settlePlan) {
      if (!leg?.from || !leg?.to) continue
      const debtor = resolveMockAddress(leg.from.identifier).toLowerCase()
      if (debtor !== state.walletAddress.toLowerCase()) continue

      if (!state.sdk) {
        executed += 1
        continue
      }

      try {
        const client = getWalletClient()
        const tx = await client.token.transferSync({
          to: resolveMockAddress(leg.to.identifier),
          amount: toTokenUnitsFromCents(leg.amountCents, 6),
          token: TOKENS.alpha,
          memo: memoToBytes32Hex(`SPLIT|${leg.from.name}|${leg.to.name}`),
        })
        pushActivity("info", `Settled ${leg.from.name} -> ${leg.to.name}`, { tx: tx.receipt.transactionHash })
        executed += 1
      } catch (error) {
        pushActivity("err", `Settlement leg failed: ${error.message || error}`)
      }
    }

    setStatus((x) => ({ ...x, split: executed ? `Executed ${executed} transfer(s).` : "No payable leg for current wallet." }))
  }

  async function quoteSwap() {
    const amount = Number(state.swap.amount)
    if (!amount || amount <= 0) {
      setStatus((x) => ({ ...x, swap: "Amount must be > 0." }))
      return
    }

    if (!state.sdk) {
      const outNum = amount * 0.998
      update({ swap: { ...state.swap, lastQuote: { outNum, px: outNum / amount } } })
      setStatus((x) => ({ ...x, swap: `Mock quote out: ${outNum.toFixed(6)}` }))
      return
    }

    try {
      const amountIn = state.sdk.parseUnits(String(amount), 6)
      const out = await state.sdk.Actions.dex.getSellQuote(getPublicClient(), {
        tokenIn: state.swap.tokenIn,
        tokenOut: state.swap.tokenOut,
        amountIn,
      })
      const outNum = Number(state.sdk.formatUnits(out, 6))
      update({ swap: { ...state.swap, lastQuote: { out, amountIn, outNum, px: outNum / amount } } })
      setStatus((x) => ({ ...x, swap: `Live quote out: ${outNum.toFixed(6)}` }))
    } catch (error) {
      setStatus((x) => ({ ...x, swap: `Quote failed: ${error.message || error}` }))
    }
  }

  async function executeSwap(e) {
    e.preventDefault()
    if (!state.walletKey) {
      setStatus((x) => ({ ...x, swap: "Set wallet first." }))
      return
    }

    if (!state.swap.lastQuote) {
      await quoteSwap()
      return
    }

    const impact = Math.abs(1 - state.swap.lastQuote.px) * 10000
    if (impact > Number(state.swap.impactBps)) {
      setStatus((x) => ({ ...x, swap: `Guard blocked: impact ${impact.toFixed(2)}bps` }))
      return
    }

    if (!state.sdk) {
      setStatus((x) => ({ ...x, swap: "Mock swap executed." }))
      return
    }

    try {
      const slip = BigInt(Number(state.swap.slippageBps))
      const minAmountOut = (state.swap.lastQuote.out * (10000n - slip)) / 10000n
      const tx = await state.sdk.Actions.dex.sellSync(getWalletClient(), {
        tokenIn: state.swap.tokenIn,
        tokenOut: state.swap.tokenOut,
        amountIn: state.swap.lastQuote.amountIn,
        minAmountOut,
      })
      setStatus((x) => ({ ...x, swap: `Swap executed: ${tx.receipt.transactionHash}` }))
      pushActivity("info", "Swap executed", { tx: tx.receipt.transactionHash })
    } catch (error) {
      setStatus((x) => ({ ...x, swap: `Swap failed: ${error.message || error}` }))
    }
  }

  function login(e) {
    e.preventDefault()
    const id = loginIdentifier.trim()
    if (!id) return
    const payload = { identifier: id, loggedInAt: Date.now() }
    localStorage.setItem(AUTH_KEY, JSON.stringify(payload))
    setAuth(payload)
  }

  function logout() {
    localStorage.removeItem(AUTH_KEY)
    setAuth(null)
  }

  function checklist() {
    const hasWallet = Boolean(state.walletAddress)
    const networkOk = state.networkStatus.includes("OK")
    const hasPayment = state.activities.some((a) => a.message.includes("Payment"))
    const hasSwap = state.activities.some((a) => a.message.includes("quote") || a.message.includes("Swap"))
    return { hasWallet, networkOk, hasPayment, hasSwap }
  }

  const checks = checklist()

  const nextStep = !checks.hasWallet
    ? "Set wallet in Onboarding"
    : !checks.networkOk
      ? "Check network"
      : !checks.hasPayment
        ? "Send first payment"
        : !checks.hasSwap
          ? "Run quote/swap"
          : "Show activity proof"
  const currentView = views.find((x) => x.id === state.view)?.label || "Workspace"

  function startTour() {
    setTourIndex(0)
    setState((s) => ({ ...s, view: TOUR[0].view }))
  }

  function goTo(view) {
    update({ view, sidebarOpen: false })
  }

  function advanceTour() {
    if (tourIndex >= TOUR.length - 1) {
      setTourIndex(-1)
      return
    }
    const nxt = tourIndex + 1
    setTourIndex(nxt)
    setState((s) => ({ ...s, view: TOUR[nxt].view }))
  }

  if (!auth) {
    return (
      <div className="landing">
        <header className="landing-nav card">
          <div className="brand">TempoPilot</div>
          <div className="row">
            <span className="mode-pill">{TEMPO.network}</span>
            <span className="mode-pill">Chain {TEMPO.chainId}</span>
          </div>
        </header>
        <section className="landing-hero card landing-banner">
          <div className="hero-copy">
            <p className="eyebrow">Tempo Payment Workspace</p>
            <h1>Modern product shell for stablecoin payments and instant settlement.</h1>
            <p>
              Smooth onboarding, one-tap transfers, split settlement, guarded swaps, and a clean activity trail in one fast interface.
            </p>
            <div className="row top-gap">
              <span className="mode-pill">Email/Phone UX</span>
              <span className="mode-pill">Fee Sponsored Transfers</span>
              <span className="mode-pill">Realtime Proof Logs</span>
            </div>
            <div className="hero-stage">
              <div className="hero-chip">
                <span className="dot ok-dot" />
                Instant settlement
              </div>
              <div className="hero-chip">
                <span className="dot live-dot" />
                Live activity stream
              </div>
              <div className="hero-chip">
                <span className="dot sync-dot" />
                Split + swap ready
              </div>
            </div>
          </div>
          <div className="hero-auth card">
            <h3>Enter Workspace</h3>
            <p className="muted">Sign in with email or phone.</p>
            <form onSubmit={login} className="auth-form top-gap">
              <label>
                Email/Phone
                <input value={loginIdentifier} onChange={(e) => setLoginIdentifier(e.target.value)} placeholder="you@email.com" required />
              </label>
              <button type="submit">Continue</button>
            </form>
          </div>
        </section>
        <section className="landing-showcase">
          <article className="card showcase-card">
            <h3>Consumer-like experience</h3>
            <p>Send money without exposing blockchain complexity in the primary flow.</p>
          </article>
          <article className="card showcase-card">
            <h3>Tempo-native capabilities</h3>
            <p>Memos, fee sponsorship, and stablecoin rails surfaced with clean product interaction design.</p>
          </article>
          <article className="card showcase-card">
            <h3>Fast operations</h3>
            <p>Instantly run onboarding, payments, split settlements, and swaps from a unified dashboard.</p>
          </article>
        </section>
        <section className="landing-grid">
          <article className="card landing-card feature-panel">
            <h3>Built-in flows</h3>
            <ul className="list compact">
              <li>Wallet setup and network validation</li>
              <li>Payment with optional memo</li>
              <li>Group expense split and settlement</li>
              <li>Swap quote and guarded execution</li>
            </ul>
          </article>
          <article className="card landing-card feature-panel">
            <h3>Product principles</h3>
            <ul className="list compact">
              <li>Minimal UI with clear hierarchy</li>
              <li>Fast actions with fewer clicks</li>
              <li>Readable transaction proof trail</li>
              <li>Responsive on laptop and mobile</li>
            </ul>
          </article>
          <article className="card landing-card feature-panel">
            <h3>Execution path</h3>
            <ul className="list compact">
              <li>Onboarding</li>
              <li>Payments</li>
              <li>Split</li>
              <li>Swap and Activity</li>
            </ul>
          </article>
        </section>
      </div>
    )
  }

  return (
    <div className={`app ${state.sidebarOpen ? "sidebar-open" : ""}`}>
      <header className="app-header card">
        <div className="left">
          <button className="hamburger ghost" onClick={() => update({ sidebarOpen: !state.sidebarOpen })}>Menu</button>
          <div className="brand">TempoPilot</div>
          <nav className="top-nav">
            {views.map((v) => (
              <button key={v.id} className={`nav-btn ${state.view === v.id ? "active" : ""}`} onClick={() => update({ view: v.id })}>{v.label}</button>
            ))}
          </nav>
        </div>
        <div className="right">
          <span className="mode-pill">Mode: {state.mode}</span>
          <span className="user-pill">{auth.identifier}</span>
          <button className="ghost" onClick={checkNetwork}>Network</button>
          <button className="ghost" onClick={startTour}>Tour</button>
          <button className="ghost" onClick={() => update({ theme: state.theme === "dark" ? "light" : "dark" })}>{state.theme === "dark" ? "Light" : "Dark"}</button>
          <button className="ghost" onClick={logout}>Logout</button>
        </div>
      </header>

      <section className="workspace-hero card">
        <div>
          <p className="eyebrow">Workspace</p>
          <h2>{currentView}</h2>
          <p className="muted">Operate onboarding, payments, split, and swap from one minimal command surface.</p>
        </div>
        <div className="workspace-kpis">
          <Metric title="Chain" value={`${TEMPO.chainId}`} />
          <Metric title="Wallet" value={state.walletAddress ? `${state.walletAddress.slice(0, 8)}...${state.walletAddress.slice(-6)}` : "Not set"} />
          <Metric title="Mode" value={state.mode.toUpperCase()} />
        </div>
      </section>

      <div className="main-layout">
        <aside className={`sidebar card ${state.sidebarOpen ? "open" : ""}`}>
          <h3>Sections</h3>
          <ul className="plain-list nav-list">
            {views.map((v) => (
              <li key={v.id}>
                <button className={`nav-btn nav-side ${state.view === v.id ? "active" : ""}`} onClick={() => goTo(v.id)}>
                  {v.label}
                </button>
              </li>
            ))}
          </ul>
          <h3>Progress</h3>
          <ul className="plain-list">
            <li><Badge ok={checks.hasWallet} /> Wallet configured</li>
            <li><Badge ok={checks.networkOk} /> Network validated</li>
            <li><Badge ok={checks.hasPayment} /> Payment sent</li>
            <li><Badge ok={checks.hasSwap} /> Quote/swap done</li>
          </ul>
          <h3>Next step</h3>
          <p className="muted">{nextStep}</p>
        </aside>

        <main className="content workspace-content">
          {state.view === "dashboard" && (
            <>
              <section className="dashboard-hero card panel">
                <div>
                  <p className="eyebrow">Command Center</p>
                  <h3>Control your Tempo payment stack in a single clean dashboard.</h3>
                  <p className="muted">Setup wallet, run payments, settle balances, and verify every transaction.</p>
                  <div className="signal-row">
                    <span className="signal"><span className="dot ok-dot" /> settlement online</span>
                    <span className="signal"><span className="dot live-dot" /> activity indexed</span>
                    <span className="signal"><span className="dot sync-dot" /> swap engine ready</span>
                  </div>
                </div>
                <div className="action-grid">
                  <button className="ghost" onClick={() => goTo("onboarding")}>Setup Wallet</button>
                  <button className="ghost" onClick={() => goTo("payments")}>Send Payment</button>
                  <button className="ghost" onClick={() => goTo("split")}>Open Split</button>
                  <button className="ghost" onClick={() => goTo("swap")}>Open Swap</button>
                </div>
              </section>

              <section className="grid-4">
                <Metric title="Network" value={state.networkStatus} />
                <Metric title="Wallet" value={state.walletAddress || "Not set"} />
                <Metric title="AlphaUSD" value={state.balances.alpha || "-"} />
                <Metric title="BetaUSD" value={state.balances.beta || "-"} />
              </section>
              <section className="grid-2">
                <section className="card panel feature-panel">
                  <h3>System status</h3>
                  <ul className="list compact">
                    <li><Badge ok={checks.hasWallet} /> Wallet configured</li>
                    <li><Badge ok={checks.networkOk} /> Connected to chain {TEMPO.chainId}</li>
                    <li><Badge ok={checks.hasPayment} /> Payment flow executed</li>
                    <li><Badge ok={checks.hasSwap} /> Quote/swap recorded</li>
                  </ul>
                  <div className="row top-gap">
                    <button className="ghost" onClick={() => goTo("onboarding")}>Setup Wallet</button>
                    <button className="ghost" onClick={() => goTo("payments")}>Send Payment</button>
                    <button className="ghost" onClick={() => goTo("split")}>Run Split</button>
                    <button className="ghost" onClick={() => goTo("swap")}>Quote Swap</button>
                  </div>
                </section>
                <section className="card panel feature-panel">
                  <h3>Recent activity</h3>
                  <ul className="list compact">
                    {state.activities.slice(0, 4).map((a, idx) => (
                      <li key={idx}>
                        <strong>{a.level}</strong> · {a.message}
                      </li>
                    ))}
                    {!state.activities.length && <li>No activity yet. Start from Onboarding.</li>}
                  </ul>
                </section>
              </section>
              <section className="card panel feature-panel">
                <h3>Flow navigator</h3>
                <div className="timeline-row">
                  <button className="ghost" onClick={() => goTo("onboarding")}>1. Onboarding</button>
                  <button className="ghost" onClick={() => goTo("payments")}>2. Payments</button>
                  <button className="ghost" onClick={() => goTo("split")}>3. Split</button>
                  <button className="ghost" onClick={() => goTo("swap")}>4. Swap</button>
                  <button className="ghost" onClick={() => goTo("activity")}>5. Proof</button>
                </div>
              </section>
            </>
          )}

          {state.view === "onboarding" && (
            <section className="card panel feature-panel">
              <div className="row">
                <button className="ghost" onClick={() => useDemoWallet("wallet1")}>Demo Wallet 1</button>
                <button className="ghost" onClick={() => useDemoWallet("wallet2")}>Wallet 2</button>
                <button className="ghost" onClick={() => useDemoWallet("wallet3")}>Wallet 3</button>
              </div>
              <div className="form top-gap">
                <label>Private key<input value={state.walletKey} onChange={(e) => update({ walletKey: e.target.value })} /></label>
                <label>RPC URL<input value={state.rpcUrl} onChange={(e) => update({ rpcUrl: e.target.value })} /></label>
                <button onClick={saveWallet}>Save Wallet</button>
              </div>
              <div className="result">{status.onboarding || "No onboarding action yet."}</div>
            </section>
          )}

          {state.view === "payments" && (
            <section className="card panel feature-panel">
              <form className="form" onSubmit={sendPayment}>
                <label>Recipient<input value={payment.to} onChange={(e) => setPayment({ ...payment, to: e.target.value })} required /></label>
                <label>Amount<input type="number" step="0.01" value={payment.amount} onChange={(e) => setPayment({ ...payment, amount: e.target.value })} required /></label>
                <label>Memo<input value={payment.memo} onChange={(e) => setPayment({ ...payment, memo: e.target.value })} /></label>
                <label className="check"><input type="checkbox" checked={payment.feeSponsored} onChange={(e) => setPayment({ ...payment, feeSponsored: e.target.checked })} /> Fee sponsorship</label>
                <button type="submit">Send Payment</button>
              </form>
              <div className="result">{status.payment || "No payment yet."}</div>
            </section>
          )}

          {state.view === "split" && (
            <section className="grid-2">
              <section className="card panel feature-panel">
                <form className="form" onSubmit={addMember}>
                  <label>Name<input value={newMember.name} onChange={(e) => setNewMember({ ...newMember, name: e.target.value })} /></label>
                  <label>Identifier<input value={newMember.identifier} onChange={(e) => setNewMember({ ...newMember, identifier: e.target.value })} /></label>
                  <button type="submit">Add Member</button>
                </form>
              </section>
              <section className="card panel feature-panel">
                <form className="form" onSubmit={addExpense}>
                  <label>Description<input value={newExpense.desc} onChange={(e) => setNewExpense({ ...newExpense, desc: e.target.value })} /></label>
                  <label>Amount<input type="number" step="0.01" value={newExpense.amount} onChange={(e) => setNewExpense({ ...newExpense, amount: e.target.value })} /></label>
                  <label>Payer<select value={newExpense.payerId} onChange={(e) => setNewExpense({ ...newExpense, payerId: e.target.value })}>{state.members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select></label>
                  <div className="chips">{state.members.map((m) => (
                    <label key={m.id} className="chip"><input type="checkbox" checked={newExpense.participants.includes(m.id)} onChange={(e) => {
                      setNewExpense((s) => ({ ...s, participants: e.target.checked ? [...s.participants, m.id] : s.participants.filter((id) => id !== m.id) }))
                    }} /> {m.name}</label>
                  ))}</div>
                  <button type="submit">Add Expense</button>
                </form>
              </section>
              <section className="card panel feature-panel">
                <h3>Balances</h3>
                <ul className="list">{state.members.map((m) => {
                  const cents = balancesMap.get(m.id) || 0
                  const sign = cents > 0 ? "+" : ""
                  return <li key={m.id}>{m.name}: {sign}${centsToUsd(cents)}</li>
                })}</ul>
              </section>
              <section className="card panel feature-panel">
                <h3>Settlement Plan</h3>
                <ul className="list">{settlePlan.map((p) => <li key={`${p.from.id}-${p.to.id}`}>{p.from.name} → {p.to.name}: ${centsToUsd(p.amountCents)}</li>)}</ul>
                <button onClick={runSettlement}>Settle All</button>
                <div className="result">{status.split || "No settlement yet."}</div>
              </section>
            </section>
          )}

          {state.view === "swap" && (
            <section className="card panel feature-panel">
              <form className="form" onSubmit={executeSwap}>
                <label>Token In<select value={state.swap.tokenIn} onChange={(e) => update({ swap: { ...state.swap, tokenIn: e.target.value } })}>{Object.entries(TOKENS).filter(([k]) => k !== "path").map(([k, v]) => <option key={k} value={v}>{k.toUpperCase()}</option>)}</select></label>
                <label>Token Out<select value={state.swap.tokenOut} onChange={(e) => update({ swap: { ...state.swap, tokenOut: e.target.value } })}>{Object.entries(TOKENS).filter(([k]) => k !== "path").map(([k, v]) => <option key={k} value={v}>{k.toUpperCase()}</option>)}</select></label>
                <label>Amount<input type="number" step="0.01" value={state.swap.amount} onChange={(e) => update({ swap: { ...state.swap, amount: e.target.value } })} /></label>
                <label>Slippage (bps)<input type="number" value={state.swap.slippageBps} onChange={(e) => update({ swap: { ...state.swap, slippageBps: Number(e.target.value) } })} /></label>
                <label>Impact guard (bps)<input type="number" value={state.swap.impactBps} onChange={(e) => update({ swap: { ...state.swap, impactBps: Number(e.target.value) } })} /></label>
                <div className="row"><button type="button" className="ghost" onClick={quoteSwap}>Get Quote</button><button type="submit">Execute Swap</button></div>
              </form>
              <div className="result">{status.swap || "No quote yet."}</div>
            </section>
          )}

          {state.view === "activity" && (
            <section className="card panel feature-panel">
              <h3>Activity</h3>
              <ul className="list">{state.activities.length ? state.activities.map((a, idx) => <li key={idx}><strong>{a.level}</strong> · {new Date(a.at).toLocaleString()}<br />{a.message}<br />{a.meta?.tx ? <a href={`https://explore.tempo.xyz/tx/${a.meta.tx}`} target="_blank" rel="noreferrer">{a.meta.tx}</a> : null}</li>) : <li>No activity yet.</li>}</ul>
            </section>
          )}
          <footer className="muted app-foot">TempoPilot · Tempo testnet workspace</footer>
        </main>
      </div>

      {tourIndex >= 0 && (
        <div className="tour-overlay">
          <div className="tour-card card">
            <h4>Tour {tourIndex + 1}/{TOUR.length}</h4>
            <p className="muted">{TOUR[tourIndex].text}</p>
            <div className="row">
              <button className="ghost" onClick={() => setTourIndex(-1)}>Skip</button>
              <button onClick={advanceTour}>{tourIndex === TOUR.length - 1 ? "Finish" : "Next"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function Badge({ ok }) {
  return <span className={`badge ${ok ? "ok" : "warn"}`}>{ok ? "done" : "todo"}</span>
}

function Metric({ title, value }) {
  return (
    <article className="card metric">
      <span>{title}</span>
      <strong>{value}</strong>
    </article>
  )
}

const views = [
  { id: "dashboard", label: "Dashboard" },
  { id: "onboarding", label: "Onboarding" },
  { id: "payments", label: "Payments" },
  { id: "split", label: "Split" },
  { id: "swap", label: "Swap" },
  { id: "activity", label: "Activity" },
]

function safeJson(value, fallback) {
  try {
    if (!value) return fallback
    return JSON.parse(value)
  } catch {
    return fallback
  }
}
