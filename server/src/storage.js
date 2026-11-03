import { promises as fs } from 'node:fs'
import { dirname, join } from 'node:path'

const FOTO_DIR = process.env.FOTO_DIR || './data/foto'

// Menulis foto ke disk. Untuk MinIO/S3, ganti isi fungsi ini dengan putObject dari SDK.
export async function simpanKeStorage(path, buffer) {
  const tujuan = join(FOTO_DIR, path)
  await fs.mkdir(dirname(tujuan), { recursive: true })
  await fs.writeFile(tujuan, buffer)
}
