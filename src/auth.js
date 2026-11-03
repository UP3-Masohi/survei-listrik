// Sementara (Langkah 6): hanya menyediakan token untuk api.js.
// Login, penyimpanan token 7 hari, dan PIN dilengkapi pada Langkah 8.
const KUNCI_TOKEN = 'token'

export function getToken() {
  return localStorage.getItem(KUNCI_TOKEN) ?? ''
}

export function setToken(token) {
  if (token) localStorage.setItem(KUNCI_TOKEN, token)
  else localStorage.removeItem(KUNCI_TOKEN)
}
