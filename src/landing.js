const AUTH_KEY = "tempopilot-auth-v1"

const el = {
  openLogin: document.querySelector("#open-login"),
  heroLogin: document.querySelector("#hero-login"),
  closeLogin: document.querySelector("#close-login"),
  loginModal: document.querySelector("#login-modal"),
  loginForm: document.querySelector("#login-form"),
  loginIdentifier: document.querySelector("#login-identifier"),
  loginStatus: document.querySelector("#login-status"),
}

function showModal() {
  el.loginModal.classList.remove("hidden")
  el.loginModal.setAttribute("aria-hidden", "false")
  el.loginIdentifier.focus()
}

function hideModal() {
  el.loginModal.classList.add("hidden")
  el.loginModal.setAttribute("aria-hidden", "true")
}

function setStatus(text, type = "muted") {
  el.loginStatus.className = `status ${type}`
  el.loginStatus.textContent = text
}

function saveAuth(identifier) {
  const auth = {
    identifier,
    loggedInAt: Date.now(),
  }
  localStorage.setItem(AUTH_KEY, JSON.stringify(auth))
}

function isLikelyIdentifier(value) {
  const v = String(value || "").trim()
  return v.includes("@") || /^\+?[0-9]{8,15}$/.test(v)
}

el.openLogin.addEventListener("click", showModal)
el.heroLogin.addEventListener("click", showModal)
el.closeLogin.addEventListener("click", hideModal)

el.loginModal.addEventListener("click", (e) => {
  if (e.target === el.loginModal) hideModal()
})

el.loginForm.addEventListener("submit", (e) => {
  e.preventDefault()
  const identifier = el.loginIdentifier.value.trim()

  if (!identifier) {
    setStatus("Identifier is required.", "err")
    return
  }

  if (!isLikelyIdentifier(identifier)) {
    setStatus("Use a valid email or phone format.", "warn")
    return
  }

  saveAuth(identifier)
  setStatus("Login successful. Opening app...", "ok")
  setTimeout(() => {
    window.location.href = "./app.html"
  }, 350)
})

const existing = localStorage.getItem(AUTH_KEY)
if (existing) {
  setStatus("Existing session found. You can open app directly.", "ok")
}
