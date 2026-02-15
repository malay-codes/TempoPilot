import {
  toCents,
  centsToUsd,
  isHexAddress,
  resolveMockAddress,
  memoToBytes32Hex,
  toTokenUnitsFromCents,
  computeBalances,
  settlementPlan,
} from "./finance.js"

const AUTH_KEY = "tempopilot-auth-v1"
const authRaw = localStorage.getItem(AUTH_KEY)
if (!authRaw) {
  window.location.href = "./index.html"
}

const TOKENS = {
  alpha: "0x20c0000000000000000000000000000000000001",
  beta: "0x20c0000000000000000000000000000000000002",
  theta: "0x20c0000000000000000000000000000000000003",
  path: "0x20c0000000000000000000000000000000000000",
}

const TEMPO = {
  chainId: 42431,
  rpcUrl: "https://rpc.moderato.tempo.xyz",
}

const STORAGE = {
  theme: "tempopilot-theme",
  app: "tempopilot-app-v2",
  tourDone: "tempopilot-tour-done",
  tourActive: "tempopilot-tour-active",
  tourIndex: "tempopilot-tour-index",
  sidebar: "tempopilot-sidebar",
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
    name: "transfer",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
]

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

const currentPage = document.body.dataset.page || "dashboard"

const state = {
  mode: "mock",
  sdk: null,
  rpcUrl: TEMPO.rpcUrl,
  walletKey: "",
  walletAddress: "",
  members: [],
  expenses: [],
  swap: {
    tokenIn: TOKENS.alpha,
    tokenOut: TOKENS.beta,
    amount: "100",
    slippageBps: 50,
    impactBps: 20,
    lastQuote: null,
  },
  activities: [],
  networkStatus: "Not checked",
  balances: {
    alpha: null,
    beta: null,
  },
  tourIndex: Number(localStorage.getItem(STORAGE.tourIndex) || 0),
}

const TOUR_STEPS = [
  {
    title: "Wallet Onboarding",
    text: "Use Demo Wallet 1, keep RPC https://rpc.moderato.tempo.xyz, then click Save Wallet and Check Network.",
    page: "onboarding",
    href: "./onboarding.html",
  },
  {
    title: "Memo Payment",
    text: "Send a small AlphaUSD payment with memo 'Dinner split'. Keep Fee Sponsored enabled.",
    page: "payments",
    href: "./payments.html",
  },
  {
    title: "Group Settlement",
    text: "Preview settlement, then click Settle All. If needed switch to another demo wallet and rerun.",
    page: "split",
    href: "./split.html",
  },
  {
    title: "Guarded Swap",
    text: "Fetch quote first, verify slippage and impact limits, then execute swap.",
    page: "swap",
    href: "./swap.html",
  },
  {
    title: "Proof Page",
    text: "Open Activity to show timestamps and explorer links as judging proof.",
    page: "activity",
    href: "./activity.html",
  },
]

const el = {
  workspace: document.querySelector(".workspace"),
  sidebar: document.querySelector(".sidebar"),
  navLinks: [...document.querySelectorAll(".nav-link")],
  metrics: [...document.querySelectorAll(".metric")],
  menuToggle: document.querySelector("#menu-toggle"),
  navOverlay: document.querySelector("#nav-overlay"),
  modePill: document.querySelector("#mode-pill"),
  currentUser: document.querySelector("#current-user"),
  themeToggle: document.querySelector("#theme-toggle"),
  checkNetwork: document.querySelector("#check-network"),
  startTour: document.querySelector("#start-tour"),
  logout: document.querySelector("#logout"),

  kpiNetwork: document.querySelector("#kpi-network"),
  kpiWallet: document.querySelector("#kpi-wallet"),
  kpiAlpha: document.querySelector("#kpi-alpha"),
  kpiBeta: document.querySelector("#kpi-beta"),
  nextStep: document.querySelector("#next-step"),

  chkWallet: document.querySelector("#chk-wallet"),
  chkNetwork: document.querySelector("#chk-network"),
  chkPayment: document.querySelector("#chk-payment"),
  chkSwap: document.querySelector("#chk-swap"),

  walletForm: document.querySelector("#wallet-form"),
  walletKey: document.querySelector("#wallet-key"),
  rpcUrl: document.querySelector("#rpc-url"),
  loadDemoWallet: document.querySelector("#load-demo-wallet"),
  loadDemoWallet2: document.querySelector("#load-demo-wallet-2"),
  loadDemoWallet3: document.querySelector("#load-demo-wallet-3"),
  onboardingStatus: document.querySelector("#onboarding-status"),

  paymentForm: document.querySelector("#payment-form"),
  payTo: document.querySelector("#pay-to"),
  payAmount: document.querySelector("#pay-amount"),
  payMemo: document.querySelector("#pay-memo"),
  payFeeSponsored: document.querySelector("#pay-fee-sponsored"),
  paymentResult: document.querySelector("#payment-result"),

  memberForm: document.querySelector("#member-form"),
  memberName: document.querySelector("#member-name"),
  memberIdf: document.querySelector("#member-idf"),
  expenseForm: document.querySelector("#expense-form"),
  expDesc: document.querySelector("#exp-desc"),
  expAmount: document.querySelector("#exp-amount"),
  expPayer: document.querySelector("#exp-payer"),
  expMembers: document.querySelector("#exp-members"),
  splitBalances: document.querySelector("#split-balances"),
  previewSettlement: document.querySelector("#preview-settlement"),
  runSettlement: document.querySelector("#run-settlement"),
  splitStatus: document.querySelector("#split-status"),
  settlementPlan: document.querySelector("#settlement-plan"),

  swapForm: document.querySelector("#swap-form"),
  swapTokenIn: document.querySelector("#swap-token-in"),
  swapTokenOut: document.querySelector("#swap-token-out"),
  swapAmount: document.querySelector("#swap-amount"),
  swapSlippage: document.querySelector("#swap-slippage"),
  swapImpact: document.querySelector("#swap-impact"),
  swapQuote: document.querySelector("#swap-quote"),
  swapResult: document.querySelector("#swap-result"),

  activityFeed: document.querySelector("#activity-feed"),

  tourOverlay: document.querySelector("#tour-overlay"),
  tourTitle: document.querySelector("#tour-title"),
  tourText: document.querySelector("#tour-text"),
  tourNext: document.querySelector("#tour-next"),
  tourSkip: document.querySelector("#tour-skip"),
}

bindEvents()
hydrateState()
applyTheme(localStorage.getItem(STORAGE.theme) || "dark")
hydrateAuthBadge()
highlightNav()
initSidebar()
await initSdk()
renderAll()

if (localStorage.getItem(STORAGE.tourActive) === "1") {
  renderTour()
}

function bindEvents() {
  on(el.menuToggle, "click", () => {
    toggleSidebar()
  })
  on(el.navOverlay, "click", () => {
    applySidebarState("closed")
  })

  el.navLinks.forEach((link) => {
    link.addEventListener("click", () => {
      if (window.matchMedia("(max-width: 1039px)").matches) {
        applySidebarState("closed")
      }
    })
  })

  el.metrics.forEach((card) => {
    card.addEventListener("click", () => {
      card.classList.toggle("metric-focus")
    })
  })

  on(el.themeToggle, "click", () => {
    const current = document.documentElement.dataset.theme === "dark" ? "dark" : "light"
    applyTheme(current === "dark" ? "light" : "dark")
  })

  on(el.logout, "click", () => {
    localStorage.removeItem(AUTH_KEY)
    window.location.href = "./index.html"
  })

  on(el.checkNetwork, "click", async () => {
    await withButtonPending(el.checkNetwork, "Checking...", async () => {
      await checkNetwork()
      const ok = state.networkStatus.includes("OK")
      setStatus(
        el.onboardingStatus,
        ok ? "ok" : "warn",
        ok ? "Network check succeeded." : `Network status: ${escapeHtml(state.networkStatus)}`
      )
    })
  })

  on(el.loadDemoWallet, "click", async () => {
    await withButtonPending(el.loadDemoWallet, "Loading...", async () => {
      await applyDemoWallet("wallet1")
      setStatus(el.onboardingStatus, "ok", "Demo wallet 1 loaded.")
    })
  })

  on(el.loadDemoWallet2, "click", async () => {
    await withButtonPending(el.loadDemoWallet2, "Loading...", async () => {
      await applyDemoWallet("wallet2")
      setStatus(el.onboardingStatus, "ok", "Demo wallet 2 loaded.")
    })
  })

  on(el.loadDemoWallet3, "click", async () => {
    await withButtonPending(el.loadDemoWallet3, "Loading...", async () => {
      await applyDemoWallet("wallet3")
      setStatus(el.onboardingStatus, "ok", "Demo wallet 3 loaded.")
    })
  })

  on(el.walletForm, "submit", async (e) => {
    e.preventDefault()
    await withButtonPending(e.submitter, "Saving...", async () => {
      state.walletKey = (el.walletKey?.value || "").trim()
      state.rpcUrl = (el.rpcUrl?.value || "").trim() || TEMPO.rpcUrl

      if (!state.walletKey) {
        state.walletAddress = ""
        state.networkStatus = "No wallet key set"
        state.balances.alpha = null
        state.balances.beta = null
        persistState()
        renderAll()
        setStatus(el.onboardingStatus, "warn", "Saved RPC only. Add private key to enable signing.")
        return
      }

      if (!/^0x[a-fA-F0-9]{64}$/.test(state.walletKey)) {
        setStatus(el.onboardingStatus, "err", "Invalid private key format. Expected 0x + 64 hex chars.")
        return
      }

      await syncWalletAddress()
      await refreshOnboardingStats()
      persistState()
      renderAll()
      setStatus(el.onboardingStatus, "ok", "Wallet saved.", `<div class=\"mono\">Address: ${escapeHtml(state.walletAddress)}</div>`)
    })
  })

  on(el.paymentForm, "submit", async (e) => {
    e.preventDefault()
    await withButtonPending(e.submitter, "Sending...", async () => {
      await sendPayment()
    })
  })

  on(el.memberForm, "submit", (e) => {
    e.preventDefault()
    const name = (el.memberName?.value || "").trim()
    const identifier = (el.memberIdf?.value || "").trim()
    if (!name || !identifier) return

    state.members.push({ id: crypto.randomUUID(), name, identifier })
    el.memberForm.reset()
    pushActivity("info", `Added member ${name}`)
    persistState()
    renderSplit()
    renderActivity()
  })

  on(el.expenseForm, "submit", (e) => {
    e.preventDefault()
    const desc = (el.expDesc?.value || "").trim()
    const amountCents = toCents(el.expAmount?.value)
    const payerId = el.expPayer?.value
    const participantIds = [...(el.expMembers?.querySelectorAll("input:checked") || [])].map((x) => x.value)

    if (!desc || !amountCents || !payerId || !participantIds.length) return

    state.expenses.push({ id: crypto.randomUUID(), desc, amountCents, payerId, participantIds })
    el.expenseForm.reset()
    pushActivity("info", `Added expense ${desc} ($${centsToUsd(amountCents)})`)
    persistState()
    renderSplit()
    renderActivity()
  })

  on(el.previewSettlement, "click", () => renderSettlementPreview())

  on(el.runSettlement, "click", async () => {
    await withButtonPending(el.runSettlement, "Settling...", async () => {
      await runSettlementFlow()
    })
  })

  on(el.swapQuote, "click", async () => {
    await withButtonPending(el.swapQuote, "Quoting...", async () => {
      await quoteSwap()
    })
  })

  on(el.swapForm, "submit", async (e) => {
    e.preventDefault()
    await withButtonPending(e.submitter, "Executing...", async () => {
      await executeSwap()
    })
  })

  on(el.startTour, "click", () => startTour())
  on(el.tourNext, "click", () => nextTourStep())
  on(el.tourSkip, "click", () => stopTour())
}

function hydrateState() {
  const raw = localStorage.getItem(STORAGE.app)
  if (!raw) {
    seedStarterSplitData()
    state.rpcUrl = TEMPO.rpcUrl
    return
  }

  try {
    const saved = JSON.parse(raw)
    state.rpcUrl = saved.rpcUrl || TEMPO.rpcUrl
    state.walletKey = saved.walletKey || ""
    state.walletAddress = saved.walletAddress || ""
    state.members = Array.isArray(saved.members) ? saved.members : []
    state.expenses = Array.isArray(saved.expenses) ? saved.expenses : []
    state.activities = Array.isArray(saved.activities) ? saved.activities : []
    state.swap = { ...state.swap, ...(saved.swap || {}) }
    state.networkStatus = saved.networkStatus || "Not checked"
    state.balances = { ...state.balances, ...(saved.balances || {}) }
  } catch {
    seedStarterSplitData()
  }
}

function persistState() {
  localStorage.setItem(
    STORAGE.app,
    JSON.stringify({
      rpcUrl: state.rpcUrl,
      walletKey: state.walletKey,
      walletAddress: state.walletAddress,
      members: state.members,
      expenses: state.expenses,
      activities: state.activities.slice(0, 300),
      swap: state.swap,
      networkStatus: state.networkStatus,
      balances: state.balances,
    })
  )
}

function seedStarterSplitData() {
  const m1 = { id: crypto.randomUUID(), name: "Ava", identifier: DEMO.wallet1.address }
  const m2 = { id: crypto.randomUUID(), name: "Neil", identifier: DEMO.wallet2.address }
  const m3 = { id: crypto.randomUUID(), name: "Sam", identifier: DEMO.wallet3.address }
  state.members = [m1, m2, m3]
  state.expenses = [
    { id: crypto.randomUUID(), desc: "Dinner", amountCents: 12000, payerId: m1.id, participantIds: [m1.id, m2.id, m3.id] },
    { id: crypto.randomUUID(), desc: "Cab", amountCents: 4500, payerId: m2.id, participantIds: [m1.id, m2.id, m3.id] },
  ]
}

function hydrateAuthBadge() {
  if (!el.currentUser) return
  try {
    const auth = JSON.parse(authRaw)
    el.currentUser.textContent = auth.identifier || "Signed in"
  } catch {
    el.currentUser.textContent = "Signed in"
  }
}

function highlightNav() {
  const pageFile = window.location.pathname.split("/").pop() || "app.html"
  document.querySelectorAll(".nav-link").forEach((link) => {
    const href = link.getAttribute("href") || ""
    link.classList.toggle("active", href.endsWith(pageFile))
  })
}

function initSidebar() {
  const saved = localStorage.getItem(STORAGE.sidebar)
  if (saved) {
    applySidebarState(saved)
    return
  }
  const compact = window.matchMedia("(max-width: 1039px)").matches
  applySidebarState(compact ? "closed" : "open")
}

function toggleSidebar() {
  if (!el.workspace) return
  const isClosed = el.workspace.classList.contains("sidebar-collapsed")
  applySidebarState(isClosed ? "open" : "closed")
}

function applySidebarState(mode) {
  if (!el.workspace) return
  const isOpen = mode === "open"
  el.workspace.classList.toggle("sidebar-collapsed", !isOpen)
  el.workspace.classList.toggle("sidebar-open", isOpen)
  if (el.navOverlay) {
    el.navOverlay.classList.toggle("hidden", !isOpen || !window.matchMedia("(max-width: 1039px)").matches)
  }
  localStorage.setItem(STORAGE.sidebar, isOpen ? "open" : "closed")
  if (el.menuToggle) {
    el.menuToggle.textContent = isOpen ? "Collapse" : "Menu"
  }
}

async function initSdk() {
  try {
    const [viem, accounts, chains, tempoViem, tempoSdk] = await Promise.all([
      import("https://esm.sh/viem"),
      import("https://esm.sh/viem/accounts"),
      import("https://esm.sh/viem/chains"),
      import("https://esm.sh/viem/tempo"),
      import("https://esm.sh/tempo.ts/viem"),
    ])

    state.sdk = {
      createClient: viem.createClient,
      http: viem.http,
      parseUnits: viem.parseUnits,
      formatUnits: viem.formatUnits,
      privateKeyToAccount: accounts.privateKeyToAccount,
      tempoChain: chains.tempoModerato || chains.tempoTestnet || chains.tempo,
      tempoActions: tempoViem.tempoActions,
      Actions: tempoSdk.Actions,
    }
    state.mode = "live"
    pushActivity("info", "Tempo SDK loaded. Live mode enabled")
  } catch (error) {
    state.sdk = null
    state.mode = "mock"
    pushActivity("warn", `SDK unavailable. Mock mode active (${String(error.message || error)})`)
  }
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

function getWalletClient(key) {
  if (!state.sdk) return null
  const account = state.sdk.privateKeyToAccount(assertHexKey(key))
  return state.sdk
    .createClient({
      account,
      chain: state.sdk.tempoChain,
      transport: state.sdk.http(state.rpcUrl),
    })
    .extend(state.sdk.tempoActions())
}

async function applyDemoWallet(key) {
  const wallet = DEMO[key]
  if (!wallet) return
  state.walletKey = wallet.privateKey
  if (el.walletKey) el.walletKey.value = state.walletKey
  await syncWalletAddress()
  await refreshOnboardingStats()
  pushActivity("info", `Loaded ${key} (${wallet.address})`)
  persistState()
  renderAll()
}

async function syncWalletAddress() {
  if (!state.walletKey) {
    state.walletAddress = ""
    return
  }

  try {
    if (state.sdk) {
      state.walletAddress = state.sdk.privateKeyToAccount(assertHexKey(state.walletKey)).address
    } else {
      state.walletAddress = DEMO.wallet1.address
    }
  } catch (error) {
    pushActivity("err", `Wallet parse failed: ${error.message || String(error)}`)
  }
}

async function checkNetwork() {
  try {
    if (!state.sdk) {
      state.networkStatus = "Mock mode"
      persistState()
      renderAll()
      return
    }

    const client = getPublicClient()
    const chainId = await client.getChainId()
    state.networkStatus = chainId === TEMPO.chainId ? `Tempo ${TEMPO.chainId} OK` : `Wrong chain: ${chainId}`
    pushActivity("info", `Network check -> ${state.networkStatus}`)
  } catch (error) {
    state.networkStatus = "Network check failed"
    pushActivity("err", `Network check failed: ${error.message || String(error)}`)
  }

  persistState()
  renderAll()
}

async function refreshOnboardingStats() {
  if (!state.walletAddress) return

  await checkNetwork()

  if (!state.sdk) {
    state.balances.alpha = "1000000.00"
    state.balances.beta = "1000000.00"
    persistState()
    renderAll()
    return
  }

  try {
    const client = getPublicClient()
    const [a, b] = await Promise.all([
      client.readContract({ address: TOKENS.alpha, abi: TOKEN_ABI, functionName: "balanceOf", args: [state.walletAddress] }),
      client.readContract({ address: TOKENS.beta, abi: TOKEN_ABI, functionName: "balanceOf", args: [state.walletAddress] }),
    ])
    state.balances.alpha = Number(state.sdk.formatUnits(a, 6)).toFixed(2)
    state.balances.beta = Number(state.sdk.formatUnits(b, 6)).toFixed(2)
  } catch (error) {
    pushActivity("warn", `Balance read failed: ${error.message || String(error)}`)
  }

  persistState()
  renderAll()
}

async function sendPayment() {
  setStatus(el.paymentResult, "pending", "Submitting payment...")
  try {
    if (!state.walletKey) throw new Error("Set wallet first in Onboarding")

    const toRaw = (el.payTo?.value || "").trim()
    const amount = Number(el.payAmount?.value || 0)
    const memo = (el.payMemo?.value || "").trim() || "TempoPilot Payment"
    const toAddress = isHexAddress(toRaw) ? toRaw : resolveMockAddress(toRaw)

    if (!amount || amount <= 0) throw new Error("Amount should be greater than 0")

    if (!state.sdk) {
      const fakeHash = `0xmock${Date.now().toString(16).padEnd(60, "0")}`
      setStatus(
        el.paymentResult,
        "warn",
        `Mock payment of $${amount.toFixed(2)} prepared for ${escapeHtml(toAddress)}`,
        `<div class=\"mono\">${fakeHash}</div>`
      )
      pushActivity("warn", `Mock payment $${amount.toFixed(2)} -> ${toAddress}`)
      persistState()
      renderAll()
      return
    }

    const client = getWalletClient(state.walletKey)
    const units = state.sdk.parseUnits(String(amount), 6)
    let hash = null

    if (client.token?.transferSync) {
      const tx = await client.token.transferSync({
        to: toAddress,
        amount: units,
        token: TOKENS.alpha,
        memo: memoToBytes32Hex(memo),
        feePayer: el.payFeeSponsored?.checked ? true : undefined,
      })
      hash = tx.receipt.transactionHash
    } else {
      hash = await client.writeContract({
        address: TOKENS.alpha,
        abi: TOKEN_ABI,
        functionName: "transferWithMemo",
        args: [toAddress, units, memoToBytes32Hex(memo)],
      })
      await getPublicClient().waitForTransactionReceipt({ hash })
    }

    const link = `https://explore.tempo.xyz/tx/${hash}`
    setStatus(
      el.paymentResult,
      "ok",
      "Payment sent successfully.",
      `<div class=\"mono\"><a target=\"_blank\" rel=\"noreferrer\" href=\"${link}\">${hash}</a></div>`
    )
    pushActivity("info", `Payment $${amount.toFixed(2)} sent`, { tx: hash, memo })
  } catch (error) {
    setStatus(el.paymentResult, "err", `Payment failed: ${escapeHtml(error.message || String(error))}`)
    pushActivity("err", `Payment failed: ${error.message || String(error)}`)
  }

  persistState()
  renderAll()
}

function renderSettlementPreview() {
  if (!el.settlementPlan) return
  const plan = buildSettlementPayloads()
  if (!plan.length) {
    el.settlementPlan.innerHTML = `<li class=\"muted\">Everyone is settled.</li>`
    return
  }

  el.settlementPlan.innerHTML = plan
    .map((p) => `<li><strong>${escapeHtml(p.from.name)}</strong> pays <strong>${escapeHtml(p.to.name)}</strong> $${centsToUsd(p.amountCents)}</li>`)
    .join("")
}

async function runSettlementFlow() {
  setStatus(el.splitStatus, "pending", "Running settlement...")
  try {
    const plan = buildSettlementPayloads()
    if (!plan.length) throw new Error("Nothing to settle")
    if (!state.walletAddress) throw new Error("Set wallet first")

    let executed = 0

    for (const p of plan) {
      const debtorAddress = resolveMockAddress(p.from.identifier).toLowerCase()
      if (debtorAddress !== state.walletAddress.toLowerCase()) continue

      if (!state.sdk) {
        executed += 1
        pushActivity("warn", `Mock settle ${p.from.name} -> ${p.to.name} $${centsToUsd(p.amountCents)}`)
        continue
      }

      const client = getWalletClient(state.walletKey)
      const amountUnits = toTokenUnitsFromCents(p.amountCents, 6)
      const memo = memoToBytes32Hex(`SPLIT|${p.from.name}|${p.to.name}|${Date.now()}`)

      let hash = null
      if (client.token?.transferSync) {
        const tx = await client.token.transferSync({
          to: resolveMockAddress(p.to.identifier),
          amount: amountUnits,
          token: TOKENS.alpha,
          memo,
        })
        hash = tx.receipt.transactionHash
      } else {
        hash = await client.writeContract({
          address: TOKENS.alpha,
          abi: TOKEN_ABI,
          functionName: "transferWithMemo",
          args: [resolveMockAddress(p.to.identifier), amountUnits, memo],
        })
        await getPublicClient().waitForTransactionReceipt({ hash })
      }
      executed += 1
      pushActivity("info", `Settled ${p.from.name} -> ${p.to.name} $${centsToUsd(p.amountCents)}`, { tx: hash })
    }

    if (!executed) {
      setStatus(el.splitStatus, "warn", "No payable legs from current wallet. Switch demo wallet and rerun.")
    } else {
      setStatus(el.splitStatus, state.sdk ? "ok" : "warn", `${executed} transfer(s) executed.`)
    }
  } catch (error) {
    setStatus(el.splitStatus, "err", `Settlement failed: ${escapeHtml(error.message || String(error))}`)
    pushActivity("err", `Settlement failed: ${error.message || String(error)}`)
  }

  persistState()
  renderAll()
}

function buildSettlementPayloads() {
  const balances = computeBalances(state.members, state.expenses)
  const plan = settlementPlan(balances)
  const map = new Map(state.members.map((m) => [m.id, m]))
  return plan.map((p) => ({ ...p, from: map.get(p.from), to: map.get(p.to) }))
}

async function quoteSwap() {
  setStatus(el.swapResult, "pending", "Fetching quote...")
  try {
    syncSwapFromInputs()
    const inNum = Number(state.swap.amount)
    if (!inNum || inNum <= 0) throw new Error("Amount must be > 0")

    if (!state.sdk) {
      const outNum = inNum * 0.998
      state.swap.lastQuote = { outNum, inNum, px: outNum / inNum }
      setStatus(el.swapResult, "warn", `Mock quote: ${outNum.toFixed(6)} out`)
      pushActivity("warn", `Mock quote ${inNum} -> ${outNum.toFixed(4)}`)
      persistState()
      renderAll()
      return
    }

    const client = getPublicClient()
    const amountIn = state.sdk.parseUnits(String(inNum), 6)
    const out = await state.sdk.Actions.dex.getSellQuote(client, {
      tokenIn: state.swap.tokenIn,
      tokenOut: state.swap.tokenOut,
      amountIn,
    })

    const outNum = Number(state.sdk.formatUnits(out, 6))
    state.swap.lastQuote = { out, amountIn, outNum, inNum, px: outNum / inNum }
    setStatus(el.swapResult, "ok", `Live quote: ${outNum.toFixed(6)} out`)
    pushActivity("info", `Live quote ${inNum} -> ${outNum.toFixed(4)}`)
  } catch (error) {
    setStatus(el.swapResult, "err", `Quote failed: ${escapeHtml(error.message || String(error))}`)
    pushActivity("err", `Quote failed: ${error.message || String(error)}`)
  }

  persistState()
  renderAll()
}

async function executeSwap() {
  setStatus(el.swapResult, "pending", "Executing swap...")
  try {
    if (!state.walletKey) throw new Error("Set wallet first")
    syncSwapFromInputs()
    if (!state.swap.lastQuote) await quoteSwap()
    if (!state.swap.lastQuote) throw new Error("Quote unavailable")

    const spreadProxyBps = Math.abs(1 - state.swap.lastQuote.px) * 10000
    if (spreadProxyBps > Number(state.swap.impactBps)) {
      throw new Error(`Guard blocked swap. Impact ${spreadProxyBps.toFixed(2)}bps > ${state.swap.impactBps}`)
    }

    if (!state.sdk) {
      setStatus(el.swapResult, "warn", "Mock swap executed.")
      pushActivity("warn", "Mock swap executed")
      persistState()
      renderAll()
      return
    }

    const client = getWalletClient(state.walletKey)
    const slip = BigInt(Number(state.swap.slippageBps))
    const minAmountOut = (state.swap.lastQuote.out * (10000n - slip)) / 10000n

    const { receipt } = await state.sdk.Actions.dex.sellSync(client, {
      tokenIn: state.swap.tokenIn,
      tokenOut: state.swap.tokenOut,
      amountIn: state.swap.lastQuote.amountIn,
      minAmountOut,
    })

    const link = `https://explore.tempo.xyz/tx/${receipt.transactionHash}`
    setStatus(
      el.swapResult,
      "ok",
      "Swap executed.",
      `<div class=\"mono\"><a target=\"_blank\" rel=\"noreferrer\" href=\"${link}\">${receipt.transactionHash}</a></div>`
    )
    pushActivity("info", "Swap executed", { tx: receipt.transactionHash })
  } catch (error) {
    setStatus(el.swapResult, "err", `Swap failed: ${escapeHtml(error.message || String(error))}`)
    pushActivity("err", `Swap failed: ${error.message || String(error)}`)
  }

  persistState()
  renderAll()
}

function syncSwapFromInputs() {
  if (!el.swapTokenIn) return
  state.swap.tokenIn = el.swapTokenIn.value
  state.swap.tokenOut = el.swapTokenOut.value
  state.swap.amount = el.swapAmount.value
  state.swap.slippageBps = Number(el.swapSlippage.value)
  state.swap.impactBps = Number(el.swapImpact.value)
}

function renderAll() {
  renderTop()
  renderJourney()
  renderOnboarding()
  renderSplit()
  renderActivity()
  renderSwapDefaults()
}

function renderTop() {
  if (el.modePill) {
    el.modePill.textContent = `Mode: ${state.mode}`
  }
}

function renderOnboarding() {
  if (el.kpiNetwork) el.kpiNetwork.textContent = state.networkStatus
  if (el.kpiWallet) el.kpiWallet.textContent = state.walletAddress || "Not set"
  if (el.kpiAlpha) el.kpiAlpha.textContent = state.balances.alpha == null ? "-" : state.balances.alpha
  if (el.kpiBeta) el.kpiBeta.textContent = state.balances.beta == null ? "-" : state.balances.beta

  if (el.rpcUrl) el.rpcUrl.value = state.rpcUrl
  if (el.walletKey) el.walletKey.value = state.walletKey
}

function renderJourney() {
  const hasWallet = Boolean(state.walletAddress)
  const networkOk = state.networkStatus.includes("OK")
  const hasPayment = state.activities.some((a) => a.message.includes("Payment $"))
  const hasSwap = state.activities.some((a) => a.message.includes("quote") || a.message.includes("Swap executed"))

  setChecklistBadge(el.chkWallet, hasWallet)
  setChecklistBadge(el.chkNetwork, networkOk)
  setChecklistBadge(el.chkPayment, hasPayment)
  setChecklistBadge(el.chkSwap, hasSwap)

  let next = "Set wallet in Onboarding"
  if (hasWallet && !networkOk) next = "Check network"
  else if (hasWallet && networkOk && !hasPayment) next = "Send first payment"
  else if (hasWallet && networkOk && hasPayment && !hasSwap) next = "Run quote/swap"
  else if (hasWallet && networkOk && hasPayment && hasSwap) next = "Open Activity for proof"

  if (el.nextStep) el.nextStep.textContent = next
}

function renderSplit() {
  if (!el.splitBalances || !el.expPayer || !el.expMembers) return

  const balances = computeBalances(state.members, state.expenses)

  if (!state.members.length) {
    el.splitBalances.innerHTML = `<li class=\"muted\">No members added.</li>`
    el.expPayer.innerHTML = ""
    el.expMembers.innerHTML = ""
    return
  }

  el.expPayer.innerHTML = state.members.map((m) => `<option value=\"${m.id}\">${escapeHtml(m.name)}</option>`).join("")
  el.expMembers.innerHTML = state.members
    .map((m) => `<label class=\"chip\"><input type=\"checkbox\" value=\"${m.id}\" checked /> ${escapeHtml(m.name)}</label>`)
    .join("")

  el.splitBalances.innerHTML = state.members
    .map((m) => {
      const cents = balances.get(m.id) || 0
      const sign = cents > 0 ? "+" : ""
      const klass = cents > 0 ? "ok" : cents < 0 ? "err" : "warn"
      return `<li><strong>${escapeHtml(m.name)}</strong><span class=\"badge ${klass}\">${sign}$${centsToUsd(cents)}</span></li>`
    })
    .join("")

  renderSettlementPreview()
}

function renderSwapDefaults() {
  if (el.swapTokenIn) {
    el.swapTokenIn.value = state.swap.tokenIn
    el.swapTokenOut.value = state.swap.tokenOut
    el.swapAmount.value = state.swap.amount
    el.swapSlippage.value = String(state.swap.slippageBps)
    el.swapImpact.value = String(state.swap.impactBps)
  }
}

function renderActivity() {
  if (!el.activityFeed) return
  if (!state.activities.length) {
    el.activityFeed.innerHTML = `<li class=\"muted\">No activity yet. Start from Onboarding.</li>`
    return
  }

  el.activityFeed.innerHTML = state.activities
    .slice(0, 120)
    .map((a) => {
      const cls = a.level === "err" ? "err" : a.level === "warn" ? "warn" : "ok"
      const link = a.meta?.tx
        ? `<div class=\"mono top-gap\"><a href=\"https://explore.tempo.xyz/tx/${a.meta.tx}\" target=\"_blank\" rel=\"noreferrer\">${a.meta.tx}</a></div>`
        : ""
      return `<li><div><span class=\"badge ${cls}\">${a.level}</span> <span class=\"muted\">${new Date(a.at).toLocaleString()}</span></div><div>${escapeHtml(
        a.message
      )}</div>${link}</li>`
    })
    .join("")
}

function pushActivity(level, message, meta = null) {
  state.activities.unshift({ at: Date.now(), level, message, meta })
  state.activities = state.activities.slice(0, 300)
}

function startTour() {
  state.tourIndex = 0
  localStorage.setItem(STORAGE.tourActive, "1")
  localStorage.setItem(STORAGE.tourIndex, "0")
  localStorage.removeItem(STORAGE.tourDone)
  renderTour()
}

function nextTourStep() {
  const next = state.tourIndex + 1
  if (next >= TOUR_STEPS.length) {
    stopTour()
    return
  }

  state.tourIndex = next
  localStorage.setItem(STORAGE.tourIndex, String(state.tourIndex))
  const step = TOUR_STEPS[state.tourIndex]
  if (step.page !== currentPage) {
    window.location.href = step.href
    return
  }
  renderTour()
}

function stopTour() {
  state.tourIndex = 0
  localStorage.setItem(STORAGE.tourDone, "1")
  localStorage.removeItem(STORAGE.tourActive)
  localStorage.removeItem(STORAGE.tourIndex)
  if (el.tourOverlay) {
    el.tourOverlay.classList.add("hidden")
    el.tourOverlay.setAttribute("aria-hidden", "true")
  }
}

function renderTour() {
  const active = localStorage.getItem(STORAGE.tourActive) === "1"
  if (!active || !el.tourOverlay || !el.tourTitle || !el.tourText || !el.tourNext) return

  const index = Number(localStorage.getItem(STORAGE.tourIndex) || state.tourIndex || 0)
  state.tourIndex = index
  const step = TOUR_STEPS[index]
  if (!step) {
    stopTour()
    return
  }

  if (step.page !== currentPage) {
    window.location.href = step.href
    return
  }

  el.tourTitle.textContent = `${index + 1}/${TOUR_STEPS.length} - ${step.title}`
  el.tourText.textContent = step.text
  el.tourNext.textContent = index === TOUR_STEPS.length - 1 ? "Finish" : "Next"
  el.tourOverlay.classList.remove("hidden")
  el.tourOverlay.setAttribute("aria-hidden", "false")
}

function setChecklistBadge(element, done) {
  if (!element) return
  element.className = `badge ${done ? "ok" : "warn"}`
  element.textContent = done ? "done" : "todo"
}

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme
  localStorage.setItem(STORAGE.theme, theme)
  if (el.themeToggle) {
    el.themeToggle.textContent = theme === "dark" ? "Light" : "Dark"
  }
}

function setStatus(element, type, message, extraHtml = "") {
  if (!element) return
  element.className = `result ${type}`
  element.innerHTML = `${message}${extraHtml ? `<div class=\"top-gap\">${extraHtml}</div>` : ""}`
}

function on(node, eventName, handler) {
  if (!node) return
  node.addEventListener(eventName, handler)
}

async function withButtonPending(button, pendingText, fn) {
  if (!button) return fn()
  const original = button.textContent
  button.disabled = true
  button.textContent = pendingText
  try {
    return await fn()
  } finally {
    button.disabled = false
    button.textContent = original
  }
}

function assertHexKey(value) {
  if (!/^0x[a-fA-F0-9]{64}$/.test(String(value || ""))) {
    throw new Error("Private key must be 0x + 64 hex chars")
  }
  return value
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;")
}
