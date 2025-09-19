import express from 'express'
import multer from 'multer'
import fs from 'fs'
import path from 'path'
import Setting from '../models/Setting.js'
import { auth, allowRoles } from '../middleware/auth.js'
import mime from 'mime-types'

const router = express.Router()

// Ensure uploads/branding directory exists
const BRANDING_DIR = path.resolve(process.cwd(), 'uploads', 'branding')
try { fs.mkdirSync(BRANDING_DIR, { recursive: true }) } catch {}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, BRANDING_DIR),
  filename: (_req, file, cb) => {
    const ts = Date.now()
    const safe = String(file.originalname || 'logo').replace(/[^a-zA-Z0-9_.-]/g, '_')
    cb(null, `${ts}_${safe}`)
  }
})
const upload = multer({ storage })

function toPublicPath(absFilename){
  // Map absolute path in uploads/branding to public /uploads/branding path
  const base = path.basename(absFilename)
  return `/uploads/branding/${encodeURIComponent(base)}`
}

// GET current branding (public)
router.get('/branding', async (_req, res) => {
  try{
    const doc = await Setting.findOne({ key: 'branding' }).lean()
    const val = (doc && doc.value) || {}
    const headerLogo = typeof val.headerLogo === 'string' ? val.headerLogo : null
    const loginLogo = typeof val.loginLogo === 'string' ? val.loginLogo : null
    const favicon = typeof val.favicon === 'string' ? val.favicon : null
    const title = typeof val.title === 'string' ? val.title : null
    const appName = typeof val.appName === 'string' ? val.appName : null
    res.json({ headerLogo, loginLogo, favicon, title, appName })
  }catch(e){ res.status(500).json({ error: e?.message || 'failed' }) }
})

// POST upload branding assets (admin)
router.post('/branding', auth, allowRoles('admin'), upload.fields([
  { name: 'header', maxCount: 1 },
  { name: 'login', maxCount: 1 },
  { name: 'favicon', maxCount: 1 },
]), async (req, res) => {
  try{
    const headerFile = req.files?.header?.[0]
    const loginFile = req.files?.login?.[0]
    const faviconFile = req.files?.favicon?.[0]

    let doc = await Setting.findOne({ key: 'branding' })
    if (!doc) doc = new Setting({ key: 'branding', value: {} })

    const value = (doc.value && typeof doc.value === 'object') ? doc.value : {}
    if (headerFile) value.headerLogo = toPublicPath(headerFile.path)
    if (loginFile) value.loginLogo = toPublicPath(loginFile.path)
    if (faviconFile) value.favicon = toPublicPath(faviconFile.path)
    if (typeof req.body?.title === 'string') value.title = req.body.title
    if (typeof req.body?.appName === 'string') value.appName = req.body.appName
    doc.value = value
    await doc.save()

    res.json({
      headerLogo: value.headerLogo || null,
      loginLogo: value.loginLogo || null,
      favicon: value.favicon || null,
      title: value.title || null,
      appName: value.appName || null,
    })
  }catch(e){ res.status(500).json({ error: e?.message || 'failed' }) }
})

// Dynamic PWA manifest using saved branding
router.get('/manifest', async (req, res) => {
  try{
    const doc = await Setting.findOne({ key: 'branding' }).lean()
    const val = (doc && doc.value) || {}
    const name = (typeof val.title === 'string' && val.title.trim()) ? val.title.trim() : 'BuySial Commerce'
    const shortName = (typeof val.appName === 'string' && val.appName.trim()) ? val.appName.trim() : name
    const themeColor = '#0f172a'

    // Use same favicon path for icons; browsers will scale. Recommended to upload a 512x512 PNG as favicon.
    const iconSrc = (typeof val.favicon === 'string' && val.favicon) ? val.favicon : null
    const iconType = iconSrc ? (mime.lookup(iconSrc) || 'image/png') : 'image/png'

    const icons = iconSrc ? [
      { src: iconSrc, sizes: '192x192', type: iconType, purpose: 'any maskable' },
      { src: iconSrc, sizes: '512x512', type: iconType, purpose: 'any maskable' },
    ] : [
      { src: '/BuySial2.png', sizes: '192x192', type: 'image/png', purpose: 'any maskable' },
      { src: '/BuySial2.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
    ]

    const manifest = {
      name,
      short_name: shortName,
      start_url: '/',
      display: 'standalone',
      background_color: themeColor,
      theme_color: themeColor,
      icons,
    }
    res.setHeader('Content-Type', 'application/manifest+json; charset=utf-8')
    res.json(manifest)
  }catch(e){ res.status(500).json({ error: e?.message || 'failed' }) }
})

export default router
