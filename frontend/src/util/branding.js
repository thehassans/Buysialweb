// Runtime helpers to apply branding (favicon, title, app name, manifest) to <head>
// Works both when the app is served by the backend and during Vite dev.
import { API_BASE } from '../api.js'

function setOrCreateLink(rel, attrs = {}){
  let el = document.querySelector(`head link[rel="${rel}"]`)
  if (!el){ el = document.createElement('link'); el.setAttribute('rel', rel); document.head.appendChild(el) }
  for (const [k,v] of Object.entries(attrs)){
    if (v == null) { el.removeAttribute(k) } else { el.setAttribute(k, String(v)) }
  }
  return el
}

function guessMimeFromHref(href){
  try{
    const u = String(href).split('?')[0].toLowerCase()
    if (u.endsWith('.svg')) return 'image/svg+xml'
    if (u.endsWith('.png')) return 'image/png'
    if (u.endsWith('.ico')) return 'image/x-icon'
    if (u.endsWith('.jpg') || u.endsWith('.jpeg')) return 'image/jpeg'
    return null
  }catch{ return null }
}

export function applyBrandingToHead({ title, appName, favicon } = {}){
  try{
    if (title && typeof title === 'string'){ document.title = title }
    const sameOrigin = !API_BASE || API_BASE.startsWith(location.origin)
    // Favicon (also reuse for apple-touch-icon)
    if (favicon && typeof favicon === 'string'){
      const isAbs = /^(https?:|data:|blob:)/i.test(favicon)
      const baseHref = isAbs ? favicon : `${API_BASE || ''}${favicon}`
      const bust = (baseHref.includes('blob:') || baseHref.includes('data:')) ? baseHref : `${baseHref}${baseHref.includes('?') ? '&' : '?'}v=${Date.now()}`
      const mime = guessMimeFromHref(baseHref)
      setOrCreateLink('icon', { href: bust, type: mime || null })
      setOrCreateLink('shortcut icon', { href: bust, type: mime || null })
      setOrCreateLink('apple-touch-icon', { href: bust })
    }
    // Manifest: prefer dynamic manifest when same-origin
    if (sameOrigin){
      setOrCreateLink('manifest', { href: '/api/settings/manifest' })
    }
  }catch{}
}

export async function bootstrapBranding(){
  try{
    const res = await fetch(`${API_BASE}/api/settings/branding`)
    if (!res.ok) return
    const j = await res.json()
    applyBrandingToHead({ title: j.title || null, appName: j.appName || null, favicon: j.favicon || null })
  }catch{}
}
