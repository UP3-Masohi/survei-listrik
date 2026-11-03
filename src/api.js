import { getToken } from './auth.js'

const BASE = import.meta.env.VITE_API_URL
const auth = () => ({ Authorization: `Bearer ${getToken()}` })

export async function kirimSurvei(s) {
  const r = await fetch(`${BASE}/surveys/${s.id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...auth() },
    body: JSON.stringify(s)
  })
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
}

export async function kirimFoto(surveyId, tipe, blob) {
  const fd = new FormData()
  fd.append('file', blob, `${tipe}.jpg`)
  const r = await fetch(`${BASE}/surveys/${surveyId}/photos/${tipe}`,
    { method: 'PUT', headers: auth(), body: fd })
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
}

// ---------- Dasbor admin ----------
export async function ambilDaftarSurvei(from, to) {
  const q = new URLSearchParams()
  if (from) q.set('from', from)
  if (to) q.set('to', to)
  const r = await fetch(`${BASE}/surveys?${q}`, { headers: auth() })
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
  return r.json()
}

export async function ambilUrlFoto(surveyId, tipe) {
  const r = await fetch(`${BASE}/surveys/${surveyId}/photos/${tipe}/url`, { headers: auth() })
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
  const { url } = await r.json()
  return `${BASE}${url}`
}

export async function hapusSurveiServer(surveyId) {
  const r = await fetch(`${BASE}/surveys/${surveyId}`, { method: 'DELETE', headers: auth() })
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
}
