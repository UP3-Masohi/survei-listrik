import { db } from './db.js'
import { tampilkanLayar, tampilkanNotifikasi, layarUtama, ikon } from './main.js'

const BASE = import.meta.env.VITE_API_URL
const MAKS_SALAH_PIN = 5
const ITERASI_PBKDF2 = 100_000
const PENANDA = 'survei-listrik-ok'   // teks yang dienkripsi untuk memverifikasi PIN

let sesiAktif = null     // { token, surveyor, expiresAt } dari IndexedDB
let kunciAktif = null    // CryptoKey AES-GCM, hanya di memori setelah PIN benar

// ===================== Sesi dan token =====================

export function getToken() { return sesiAktif?.token ?? '' }
export function getSurveyor() { return sesiAktif?.surveyor ?? null }
export function sudahTerbuka() { return kunciAktif !== null }
export function sesiKedaluwarsa() { return !!sesiAktif && Date.now() > sesiAktif.expiresAt }

export async function muatSesi() {
  localStorage.removeItem('token')   // sisa penyimpanan sementara Langkah 6; token kini di IndexedDB
  sesiAktif = (await db.sesi.get('token'))?.nilai ?? null
  return sesiAktif
}

function bacaExpJwt(token) {
  try {
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')))
    return payload.exp * 1000
  } catch { return Date.now() + 7 * 24 * 3600 * 1000 }
}

export async function login(username, password) {
  let r
  try {
    r = await fetch(`${BASE}/auth/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    })
  } catch {
    throw new Error('Tidak bisa menghubungi server. Login membutuhkan koneksi internet.')
  }
  if (r.status === 401) throw new Error('Username atau password salah.')
  if (!r.ok) throw new Error(`Server menolak login (HTTP ${r.status}).`)
  const { token, surveyor } = await r.json()
  sesiAktif = { token, surveyor, expiresAt: bacaExpJwt(token) }
  await db.sesi.put({ kunci: 'token', nilai: sesiAktif })
  return surveyor
}

// ===================== Kunci dari PIN (PBKDF2 -> AES-GCM) =====================

const enc = new TextEncoder()
const dec = new TextDecoder()

async function turunkanKunci(pin, salt) {
  const bahan = await crypto.subtle.importKey('raw', enc.encode(pin), 'PBKDF2', false, ['deriveKey'])
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: ITERASI_PBKDF2, hash: 'SHA-256' },
    bahan, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
}

export async function adaPin() {
  return !!(await db.sesi.get('pin'))
}

export async function buatPin(pin) {
  if (!/^\d{6}$/.test(pin)) throw new Error('PIN harus 6 digit angka.')
  const salt = crypto.getRandomValues(new Uint8Array(16))
  kunciAktif = await turunkanKunci(pin, salt)
  const verifier = await enkripsiBytes(enc.encode(PENANDA))
  await db.sesi.put({ kunci: 'pin', nilai: { salt, verifier, salah: 0 } })
}

// Mengembalikan { ok: true } atau { ok: false, sisa } atau { ok: false, dihapus: true }
export async function bukaDenganPin(pin) {
  const rec = (await db.sesi.get('pin'))?.nilai
  if (!rec) throw new Error('PIN belum dibuat.')
  const kunci = await turunkanKunci(pin, rec.salt)
  try {
    const teks = dec.decode(await dekripsiBytesDengan(kunci, rec.verifier))
    if (teks !== PENANDA) throw new Error('salah')
  } catch {
    const salah = rec.salah + 1
    if (salah >= MAKS_SALAH_PIN) {
      await hapusDataLokal()
      return { ok: false, dihapus: true }
    }
    await db.sesi.put({ kunci: 'pin', nilai: { ...rec, salah } })
    return { ok: false, sisa: MAKS_SALAH_PIN - salah }
  }
  if (rec.salah) await db.sesi.put({ kunci: 'pin', nilai: { ...rec, salah: 0 } })
  kunciAktif = kunci
  return { ok: true }
}

export function kunci() { kunciAktif = null }

// Salah PIN 5 kali, atau keluar: semua data lokal dihapus dan wajib login ulang
export async function hapusDataLokal() {
  await Promise.all([db.surveys.clear(), db.photos.clear(), db.outbox.clear(), db.sesi.clear()])
  kunciAktif = null
  sesiAktif = null
}

// ===================== Enkripsi AES-GCM =====================

function pastikanTerbuka() {
  if (!kunciAktif) throw new Error('Aplikasi terkunci, masukkan PIN dulu.')
  return kunciAktif
}

async function enkripsiBytesDengan(kunci, bytes) {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, kunci, bytes)
  return { iv, data }
}

async function dekripsiBytesDengan(kunci, { iv, data }) {
  return crypto.subtle.decrypt({ name: 'AES-GCM', iv }, kunci, data)
}

export function enkripsiBytes(bytes) { return enkripsiBytesDengan(pastikanTerbuka(), bytes) }
export function dekripsiBytes(paket) { return dekripsiBytesDengan(pastikanTerbuka(), paket) }

export async function enkripsi(objek) { return enkripsiBytes(enc.encode(JSON.stringify(objek))) }
export async function dekripsi(paket) { return JSON.parse(dec.decode(await dekripsiBytes(paket))) }

// ===================== Layar login dan PIN =====================

const hero = (judul, sub) => `
  <div class="masuk-hero">
    <div class="logo-besar">${ikon('petir')}</div>
    <h2>${judul}</h2>
    <p>${sub}</p>
  </div>`

function inputPin(id, label) {
  return `
    <label class="field">
      <span>${label}</span>
      <input id="${id}" type="password" inputmode="numeric" maxlength="6" pattern="\\d{6}"
             autocomplete="one-time-code" class="input-pin" placeholder="••••••">
    </label>`
}

const titikPin = () => `<div class="pin-titik" aria-hidden="true">${'<span></span>'.repeat(6)}</div>`
function ikatTitik(input, wadah) {
  const titik = wadah.querySelectorAll('.pin-titik span')
  input.addEventListener('input', () => titik.forEach((t, i) => t.classList.toggle('isi', i < input.value.length)))
}

export function tampilkanLogin(el, { pesan } = {}) {
  el.innerHTML = `
    <div class="masuk-wadah">
      ${hero('Survey Calon Pelanggan', 'Survei calon pelanggan listrik, bekerja tanpa sinyal')}
      <section class="kartu">
        <h2>Masuk</h2>
        <p>${pesan || 'Login membutuhkan koneksi internet. Setelah itu aplikasi bisa dipakai tanpa sinyal dengan PIN.'}</p>
        <form id="form-login" novalidate>
          <label class="field"><span>Username</span>
            <input name="username" type="text" autocomplete="username" autocapitalize="none" required></label>
          <label class="field"><span>Password</span>
            <input name="password" type="password" autocomplete="current-password" required></label>
          <small class="galat" id="galat-login"></small>
          <button type="submit" class="tombol" id="btn-login" style="margin-top:14px">Masuk</button>
        </form>
      </section>
    </div>`
  const form = el.querySelector('#form-login')
  const galat = el.querySelector('#galat-login')
  if (!navigator.onLine) galat.textContent = 'Anda sedang offline. Sambungkan internet untuk masuk.'
  form.addEventListener('submit', async e => {
    e.preventDefault()
    const tombol = form.querySelector('#btn-login')
    const username = form.username.value.trim()
    const password = form.password.value
    if (!username || !password) { galat.textContent = 'Username dan password wajib diisi.'; return }
    tombol.disabled = true
    tombol.textContent = 'Memeriksa…'
    try {
      const surveyor = await login(username, password)
      tampilkanNotifikasi(`Selamat datang, ${surveyor.nama}`)
      tampilkanLayar((await adaPin()) ? 'pin' : 'buat-pin')
    } catch (err) {
      galat.textContent = err.message
    } finally {
      tombol.disabled = false
      tombol.textContent = 'Masuk'
    }
  })
}

export function tampilkanBuatPin(el) {
  el.innerHTML = `
    <div class="masuk-wadah">
      ${hero('Buat PIN', 'PIN 6 digit untuk membuka aplikasi tanpa sinyal')}
      <section class="kartu">
        <p>PIN mengunci data survei di HP ini. Salah 5 kali berturut-turut, data lokal dihapus dan Anda harus login ulang.</p>
        <form id="form-pin" novalidate>
          ${inputPin('pin1', 'PIN baru (6 digit)')}
          ${inputPin('pin2', 'Ulangi PIN')}
          <small class="galat" id="galat-pin"></small>
          <button type="submit" class="tombol" style="margin-top:14px">Simpan PIN</button>
        </form>
      </section>
    </div>`
  const form = el.querySelector('#form-pin')
  const galat = el.querySelector('#galat-pin')
  form.addEventListener('submit', async e => {
    e.preventDefault()
    const pin1 = form.querySelector('#pin1').value
    const pin2 = form.querySelector('#pin2').value
    if (!/^\d{6}$/.test(pin1)) { galat.textContent = 'PIN harus 6 digit angka.'; return }
    if (pin1 !== pin2) { galat.textContent = 'PIN tidak sama.'; return }
    await buatPin(pin1)
    tampilkanNotifikasi('PIN tersimpan')
    tampilkanLayar(layarUtama())
  })
}

export function tampilkanPin(el) {
  const surveyor = getSurveyor()
  el.innerHTML = `
    <div class="masuk-wadah">
      ${hero('Masukkan PIN', surveyor ? `Masuk sebagai ${surveyor.nama}` : 'Ketik PIN 6 digit untuk membuka aplikasi')}
      <section class="kartu">
        <form id="form-pin" novalidate>
          ${titikPin()}
          ${inputPin('pin', 'PIN')}
          <small class="galat" id="galat-pin"></small>
          <button type="submit" class="tombol" style="margin-top:14px">Buka</button>
        </form>
      </section>
      <p style="text-align:center"><button type="button" class="tautan" id="btn-ganti-akun">Masuk dengan akun lain</button></p>
    </div>`
  const form = el.querySelector('#form-pin')
  const galat = el.querySelector('#galat-pin')
  const input = form.querySelector('#pin')
  ikatTitik(input, form)
  el.querySelector('#btn-ganti-akun').addEventListener('click', async () => {
    const antri = await db.outbox.count()
    const pesan = antri
      ? `Masih ada ${antri} survei yang belum terkirim. Keluar sekarang akan MENGHAPUS semuanya dari HP ini. Lanjutkan?`
      : 'Keluar akan menghapus sesi dan data survei di HP ini. Lanjutkan?'
    if (!confirm(pesan)) return
    await hapusDataLokal()
    tampilkanLayar('login')
  })
  input.focus()
  form.addEventListener('submit', async e => {
    e.preventDefault()
    const pin = input.value
    if (!/^\d{6}$/.test(pin)) { galat.textContent = 'PIN harus 6 digit angka.'; return }
    const hasil = await bukaDenganPin(pin)
    if (hasil.ok) return tampilkanLayar(layarUtama())
    input.value = ''
    input.dispatchEvent(new Event('input'))
    if (hasil.dihapus) {
      tampilkanNotifikasi('PIN salah 5 kali. Data lokal dihapus, silakan login ulang.', { durasiMs: 8000 })
      return tampilkanLayar('login')
    }
    galat.textContent = `PIN salah. Sisa percobaan: ${hasil.sisa}.`
  })
}
