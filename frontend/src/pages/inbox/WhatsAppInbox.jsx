import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { apiGet, apiPost, apiUpload, apiGetBlob, API_BASE } from '../../api.js'
import { io } from 'socket.io-client'
import Avatar from '../../ui/Avatar.jsx'
import { parsePhoneNumberFromString } from 'libphonenumber-js'

// Avatar UI moved to src/ui/Avatar.jsx

export default function WhatsAppInbox(){
  const navigate = useNavigate()
  const location = useLocation()
  const [isMobile, setIsMobile] = useState(()=> (typeof window!=='undefined' ? window.innerWidth <= 768 : false))
  const [chats,setChats] = useState([])
  const [activeJid,setActiveJid] = useState(null)
  const [messages,setMessages] = useState([])
  const [hasMore,setHasMore] = useState(false)
  const [beforeId,setBeforeId] = useState(null)
  const [loadingMore,setLoadingMore] = useState(false)
  const [text,setText] = useState('')
  const [uploading,setUploading] = useState(false)
  const [recording,setRecording] = useState(false)
  const [recSeconds, setRecSeconds] = useState(0)
  const recTimerRef = useRef(null)
  const recStartXRef = useRef(null)
  const recCancelRef = useRef(false)
  const [recDragging, setRecDragging] = useState(false)
  const [recWillCancel, setRecWillCancel] = useState(false)
  const recDocHandlersBoundRef = useRef(false)
  const recStartedAtRef = useRef(0)
  const [showEmoji, setShowEmoji] = useState(false)
  const [showAttach, setShowAttach] = useState(false)
  const emojiRef = useRef(null)
  const attachRef = useRef(null)
  const attachSheetRef = useRef(null)
  const photoInputRef = useRef(null)
  const videoInputRef = useRef(null)
  const docInputRef = useRef(null)
  const audioInputRef = useRef(null)
  const mediaRecorderRef = useRef(null)
  const chunksRef = useRef([])
  const endRef = useRef(null)
  const listRef = useRef(null)
  const mediaUrlCacheRef = useRef(new Map()) // key: `${jid}:${id}` -> objectURL
  const waveformCacheRef = useRef(new Map()) // key: media URL -> { peaks, duration }
  // Notifications & sound
  const [notifyGranted, setNotifyGranted] = useState(()=> (typeof Notification!=='undefined' && Notification.permission==='granted'))
  const [soundOn, setSoundOn] = useState(()=>{ try{ const v=localStorage.getItem('wa_sound'); return v? v!=='false' : true }catch{ return true } })

  // Chat list filters and new chat UX
  const [chatFilter, setChatFilter] = useState('all') // all | unread | read
  const [showNewChat, setShowNewChat] = useState(false)
  const [newChatPhone, setNewChatPhone] = useState('')

  const filteredChats = useMemo(()=>{
    const isUnread = (c)=> !!(c?.unread || (typeof c?.unreadCount === 'number' && c.unreadCount > 0))
    if (chatFilter === 'unread') return chats.filter(isUnread)
    if (chatFilter === 'read') return chats.filter(c => !isUnread(c))
    return chats
  }, [chats, chatFilter])

  function createNewChat(){
    const digits = (newChatPhone || '').replace(/[^0-9]/g, '')
    if (!digits) return
    const jid = `${digits}@s.whatsapp.net`
    const qs = new URLSearchParams(location.search)
    qs.set('jid', jid)
    setShowNewChat(false)
    setNewChatPhone('')
    navigate(`${location.pathname}?${qs.toString()}`, { replace:false })
  }

  // Replace an optimistic temp voice bubble with the server-confirmed one, keeping localUrl for immediate playback
  function reconcileTempVoice(tempId, serverMsg, localUrl){
    try{
      if (!serverMsg || !serverMsg.key || !serverMsg.key.id) return
      setMessages(prev => prev.map(m => {
        if (m?.key?.id !== tempId) return m
        const merged = { ...serverMsg }
        try{
          if (localUrl){
            const audioMsg = (merged.message && merged.message.audioMessage) ? merged.message.audioMessage : (merged.message.audioMessage = {})
            audioMsg.localUrl = localUrl
          }
        }catch{}
        merged.status = merged.status || 'sent'
        return merged
      }))
    }catch{}
  }

  // Voice upload fallback (for browsers without MediaRecorder)
  async function onVoiceFile(e){
    try{
      const input = e.target
      const files = Array.from(input.files||[])
      if(!activeJid || files.length===0) return
      setUploading(true)
      // Optimistic local bubble
      const f = files[0]
      const localUrl = URL.createObjectURL(f)
      const estSeconds = Math.max(1, Math.round((f.size||4000) / 4000))
      const tempId = 'temp:voice:' + Date.now()
      const optimistic = {
        key: { id: tempId, fromMe: true },
        message: { audioMessage: { mimetype: f.type || 'audio/webm', seconds: estSeconds, localUrl } },
        messageTimestamp: Math.floor(Date.now()/1000),
        status: 'sending'
      }
      setMessages(prev => [...prev, optimistic])
      setTimeout(()=> endRef.current?.scrollIntoView({ behavior:'smooth' }), 0)
      const fd = new FormData()
      fd.append('jid', activeJid)
      // only first file (native capture should provide one)
      fd.append('voice', f)
      const r = await apiUpload('/api/wa/send-voice', fd)
      if (r && r.message && r.message.key && r.message.key.id){
        reconcileTempVoice(tempId, r.message, localUrl)
      } else {
        // Fallback: if server didn't echo a message, refresh from server
        setMessages(prev => prev.filter(m => m?.key?.id !== tempId))
        try{ URL.revokeObjectURL(localUrl) }catch{}
        await loadMessages(activeJid)
      }
    }catch(err){
      const msg = err?.message || 'Failed to send voice message'
      if (/403/.test(String(msg))){
        alert('Not allowed to send to this chat. If you are an agent, make sure the chat is assigned to you.')
      } else {
        alert(msg)
      }
    }finally{
      setUploading(false)
      try{ e.target.value='' }catch{}
    }
  }

  // Country name helpers
  const regionNames = useMemo(()=>{
    try{ return new Intl.DisplayNames(['en'], { type: 'region' }) }catch{ return null }
  },[])
  function countryNameFromJid(jid){
    try{
      const digits = formatJid(jid)
      if (!digits) return null
      const ph = parsePhoneNumberFromString('+'+digits)
      const iso = ph?.country || null
      if (!iso) return null
      const name = regionNames?.of ? regionNames.of(iso) : iso
      return name || iso
    }catch{ return null }
  }

  // Determine role from localStorage to tailor UI (e.g., hide auto-assign for agents)
  const myRole = useMemo(()=>{
    try{ return (JSON.parse(localStorage.getItem('me')||'{}')||{}).role || null }catch{ return null }
  },[])
  const myId = useMemo(()=>{
    try{ return (JSON.parse(localStorage.getItem('me')||'{}')||{}).id || null }catch{ return null }
  },[])

  // Chat menu and modals
  const [showChatMenu, setShowChatMenu] = useState(false)
  const chatMenuRef = useRef(null)
  const [showNotesModal, setShowNotesModal] = useState(false)
  const [notes, setNotes] = useState([])
  const [newNote, setNewNote] = useState('')
  const [notesLoading, setNotesLoading] = useState(false)
  const [showAssignModal, setShowAssignModal] = useState(false)
  const [agents, setAgents] = useState([])
  const [agentsLoading, setAgentsLoading] = useState(false)
  const [selectedAgent, setSelectedAgent] = useState('')
  const [agentQuery, setAgentQuery] = useState('')
  const [assignedTo, setAssignedTo] = useState(null)
  const [autoAssign, setAutoAssign] = useState(true)
  const [autoAssignLoading, setAutoAssignLoading] = useState(false)
  const [toast, setToast] = useState('')

  async function loadChats(){
    try{ setChats(await apiGet('/api/wa/chats')) }catch(_e){}
  }

  async function loadAutoAssign(){
    try{
      const r = await apiGet('/api/wa/auto-assign')
      if (typeof r?.enabled === 'boolean') setAutoAssign(r.enabled)
    }catch(_e){}
  }

  // Navigate to Submit Order page for current area (user/agent)
  function goToSubmitOrder(){
    const path = location?.pathname || ''
    const base = path.startsWith('/agent') ? '/agent' : '/user'
    const chatName = (chats.find(c=>c.id===activeJid)?.name) || formatJid(activeJid)
    setShowChatMenu(false)
    const q = new URLSearchParams({ jid: activeJid || '', name: chatName || '' }).toString()
    navigate(`${base}/orders?${q}`)
  }

  function VideoBubble({ jid, msg, content, ensureMediaUrl }){
    const [url, setUrl] = useState(null)
    const caption = content?.videoMessage?.caption || ''
    useEffect(()=>{
      let alive = true
      const load = async ()=>{
        const u = await ensureMediaUrl(jid, msg?.key?.id)
        if (alive) setUrl(u)
      }
      load()
      return ()=>{ alive = false }
    },[jid, msg?.key?.id])
    return (
      <div style={{display:'grid', gap:6}}>
        {url ? (
          <video src={url} controls preload="metadata" style={{maxWidth:'280px', borderRadius:6}} />
        ) : (
          <span style={{ opacity:0.7 }}>[video]</span>
        )}
        {caption && <div style={{opacity:0.9}}>{caption}</div>}
      </div>
    )
  }

  function DocumentBubble({ jid, msg, content, ensureMediaUrl }){
    const [url, setUrl] = useState(null)
    const name = content?.documentMessage?.fileName || 'document'
    const size = content?.documentMessage?.fileLength
    useEffect(()=>{
      let alive = true
      const load = async ()=>{
        const u = await ensureMediaUrl(jid, msg?.key?.id)
        if (alive) setUrl(u)
      }
      load()
      return ()=>{ alive = false }
    },[jid, msg?.key?.id])
    function fmtSize(n){
      if(!n) return ''
      const i = Math.floor(Math.log(n)/Math.log(1024))
      const num = (n/Math.pow(1024,i)).toFixed(1)
      const unit = ['B','KB','MB','GB','TB'][i] || 'B'
      return `${num} ${unit}`
    }
    return (
      <div style={{display:'grid', gap:6}}>
        {url ? (
          <a href={url} target="_blank" rel="noreferrer" className="btn secondary" style={{justifySelf:'start'}}>
            📄 {name} {size ? `(${fmtSize(size)})` : ''}
          </a>
        ) : (
          <span style={{ opacity:0.7 }}>[file] {name}</span>
        )}
      </div>
    )
  }

  // Unwrap Baileys wrapper messages to the core content
  function unwrapMessage(message){
    let m = message || {}
    let guard = 0
    while (guard++ < 6){
      if (m?.deviceSentMessage?.message){ m = m.deviceSentMessage.message; continue }
      if (m?.ephemeralMessage?.message){ m = m.ephemeralMessage.message; continue }
      if (m?.viewOnceMessageV2?.message){ m = m.viewOnceMessageV2.message; continue }
      if (m?.viewOnceMessageV2Extension?.message){ m = m.viewOnceMessageV2Extension.message; continue }
      if (m?.viewOnceMessage?.message){ m = m.viewOnceMessage.message; continue }
      // Generic wrapper fallback
      if (m && typeof m==='object' && 'message' in m && m.message && typeof m.message==='object'){
        m = m.message; continue
      }
      break
    }
    return m
  }

  async function loadMessages(jid, { reset=false } = {}){
    if(!jid) return
    try{
      const r = await apiGet(`/api/wa/messages?jid=${encodeURIComponent(jid)}&limit=50`)
      const items = Array.isArray(r) ? r : (r?.items||[])
      setMessages(items)
      setHasMore(!!r?.hasMore)
      setBeforeId(r?.nextBeforeId||null)
      if (reset){ setTimeout(()=> endRef.current?.scrollIntoView({behavior:'auto'}), 0) }
    }catch(_e){}
  }

  useEffect(()=>{ loadChats(); loadAutoAssign() },[])

  // Ask for notifications permission on first load (best-effort)
  useEffect(()=>{
    try{
      if (typeof Notification!=='undefined' && Notification.permission==='default'){
        Notification.requestPermission().then(p=> setNotifyGranted(p==='granted')).catch(()=>{})
      }
    }catch{}
  },[])

  // Track viewport
  useEffect(()=>{
    function onResize(){ setIsMobile(window.innerWidth <= 768) }
    window.addEventListener('resize', onResize)
    return ()=> window.removeEventListener('resize', onResize)
  },[])

  // Proactively refresh chats when layout mode changes or page/tab becomes visible
  useEffect(()=>{
    // When switching between mobile/desktop layouts, refresh list to avoid stale/empty state
    loadChats()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMobile])

  useEffect(()=>{
    function onVisible(){ if (document.visibilityState === 'visible') loadChats() }
    window.addEventListener('focus', loadChats)
    document.addEventListener('visibilitychange', onVisible)
    return ()=>{ window.removeEventListener('focus', loadChats); document.removeEventListener('visibilitychange', onVisible) }
  },[])

  // Mobile fallback: if no chats after mount, retry shortly
  useEffect(()=>{
    if (isMobile && !activeJid && chats.length === 0){
      const id = setTimeout(()=> loadChats(), 400)
      return ()=> clearTimeout(id)
    }
  }, [isMobile, activeJid, chats.length])

  // Keep activeJid in sync with URL (?jid=...)
  useEffect(()=>{
    const qs = new URLSearchParams(location.search)
    const jid = qs.get('jid')
    setActiveJid(jid || null)
  },[location.search])

  useEffect(()=>{ 
    if(activeJid){ 
      loadMessages(activeJid, { reset:true })
      // mark as read server-side and locally
      apiPost('/api/wa/mark-read', { jid: activeJid }).catch(()=>{})
      setChats(prev => prev.map(c => c.id===activeJid ? { ...c, unread:false, unreadCount:0 } : c))
    } 
  },[activeJid])

  // Real-time updates with WebSockets
  useEffect(()=>{
    const socket = io(API_BASE, { transports: ['websocket','polling'], withCredentials: true, path: '/socket.io' })

    socket.on('connect', ()=> console.log('Socket connected'))
    socket.on('disconnect', ()=> console.log('Socket disconnected'))
    socket.on('connect_error', (err)=>{
      // Helpful logging to diagnose connection issues
      console.warn('Socket connect_error:', err?.message || err)
    })

    // Listen for new messages
    socket.on('message.new', ({ jid, message }) => {
      loadChats() // Refresh chat list for preview and order
      if (jid === activeJid) {
        setMessages(prev => [...prev, message])
        setTimeout(()=> endRef.current?.scrollIntoView({ behavior:'smooth' }), 100)
      }
      // Notify on incoming messages when tab hidden or different chat
      try{
        const isMe = !!message?.key?.fromMe
        if (!isMe){
          const hidden = document.hidden || !document.hasFocus()
          const notActive = jid !== activeJid
          if (hidden || notActive){
            notifyIncoming(jid, message)
          }
        }
      }catch{}
    })

    // Listen for message status updates
    socket.on('message.status', ({ jid, id, status }) => {
      if (jid === activeJid) {
        setMessages(prev => prev.map(m => m.key?.id === id ? { ...m, status } : m))
      }
    })

    return ()=> socket.disconnect()
  },[activeJid])

  // Close popovers on outside click
  useEffect(()=>{
    function onDocClick(e){
      if (showEmoji && emojiRef.current && !emojiRef.current.contains(e.target)) setShowEmoji(false)
      // Only close attach if click is outside both the trigger button and the sheet panel
      if (
        showAttach && attachRef.current && !attachRef.current.contains(e.target) &&
        !(attachSheetRef.current && attachSheetRef.current.contains(e.target))
      ){
        setShowAttach(false)
      }
      if (showChatMenu && chatMenuRef.current && !chatMenuRef.current.contains(e.target)) setShowChatMenu(false)
    }
    document.addEventListener('mousedown', onDocClick)
    return ()=> document.removeEventListener('mousedown', onDocClick)
  }, [showEmoji, showAttach, showChatMenu])

  // Filter agents during Assign modal (debounced)
  useEffect(()=>{
    if (!showAssignModal) return
    const id = setTimeout(async ()=>{
      try{
        const r = await apiGet(`/api/users/agents?q=${encodeURIComponent(agentQuery||'')}`)
        const list = r?.users || []
        setAgents(list)
        if (!selectedAgent && list[0]) setSelectedAgent(list[0]._id || list[0].id)
      }catch{}
    }, 300)
    return ()=> clearTimeout(id)
  }, [agentQuery, showAssignModal])

  async function openNotes(){
    if(!activeJid) return
    setNotesLoading(true)
    try{
      const meta = await apiGet(`/api/wa/chat-meta?jid=${encodeURIComponent(activeJid)}`)
      setNotes(meta?.notes||[])
      setAssignedTo(meta?.assignedTo||null)
      setShowNotesModal(true)
    }catch(_e){} finally { setNotesLoading(false); setShowChatMenu(false) }
  }

  async function addNote(){
    if(!activeJid || !newNote.trim()) return
    setNotesLoading(true)
    try{
      const r = await apiPost('/api/wa/chat-meta/notes', { jid: activeJid, text: newNote.trim() })
      setNotes(r?.meta?.notes||[])
      setNewNote('')
    }catch(_e){} finally { setNotesLoading(false) }
  }

  async function openAssign(){
    if(!activeJid) return
    setAgentsLoading(true)
    try{
      const [meta, list] = await Promise.all([
        apiGet(`/api/wa/chat-meta?jid=${encodeURIComponent(activeJid)}`),
        apiGet('/api/users/agents')
      ])
      setAssignedTo(meta?.assignedTo||null)
      setAgents(list?.users||[])
      setSelectedAgent((list?.users?.[0]?._id || list?.users?.[0]?.id) || '')
      setShowAssignModal(true)
    }catch(_e){} finally { setAgentsLoading(false); setShowChatMenu(false) }
  }

  async function assignAgent(){
    if(!activeJid || !selectedAgent) return
    setAgentsLoading(true)
    try{
      const r = await apiPost('/api/wa/chat-meta/assign', { jid: activeJid, agentId: selectedAgent })
      setAssignedTo(r?.meta?.assignedTo||null)
      // Refresh chats so assigned owner appears immediately
      await loadChats()
      setShowAssignModal(false)
      // Show success toast
      const justAssigned = agents.find(a => (a?._id||a?.id) === selectedAgent)
      const name = justAssigned ? `${justAssigned.firstName||''} ${justAssigned.lastName||''}`.trim() || justAssigned.email : 'agent'
      setToast(`Assigned to ${name}`)
      setTimeout(()=> setToast(''), 2200)
    }catch(_e){} finally { setAgentsLoading(false) }
  }

  // Toggle WhatsApp auto-assign (admin/user only)
  async function toggleAutoAssign(){
    setAutoAssignLoading(true)
    try{
      const r = await apiPost('/api/wa/auto-assign', { enabled: !autoAssign })
      if (typeof r?.enabled === 'boolean') setAutoAssign(r.enabled)
    }catch(err){
      alert(err?.message || 'Failed to update auto-assign')
    }finally{
      setAutoAssignLoading(false)
    }
  }

  async function send(){
    if(!activeJid || !text.trim()) return
    if (myRole === 'agent' && !canSend){
      alert('This chat is not assigned to you. Ask the admin/user to assign it to you to reply.')
      return
    }
    // If the sender is an agent, prefix the message with agent name in bold (WhatsApp supports *bold*)
    let toSend = text
    if (myRole === 'agent'){
      try{
        const me = JSON.parse(localStorage.getItem('me')||'{}')
        const name = [me?.firstName, me?.lastName].filter(Boolean).join(' ') || 'Agent'
        toSend = `*${name}:*\n` + text
      }catch{ /* noop */ }
    }
    // Optimistic append for instant responsiveness
    const tempId = 'temp:' + Date.now()
    const optimistic = {
      key: { id: tempId, fromMe: true },
      message: { conversation: toSend },
      messageTimestamp: Math.floor(Date.now()/1000),
      status: 'sending'
    }
    setMessages(prev => [...prev, optimistic])
    setTimeout(()=> endRef.current?.scrollIntoView({ behavior:'smooth' }), 0)
    try{
      await apiPost('/api/wa/send-text', { jid: activeJid, text: toSend })
    }catch(err){
      const msg = err?.message || ''
      if (/403/.test(msg)){
        alert('Not allowed to send to this chat. If you are an agent, make sure the chat is assigned to you.')
        // Rollback optimistic
        setMessages(prev => prev.filter(m => m?.key?.id !== tempId))
        return
      }
      // Handle WhatsApp not connected gracefully
      if (/wa-not-connected/i.test(msg)){
        try{
          // Verify actual backend status to avoid false prompts right after reconnect
          const st = await apiGet('/api/wa/status')
          const isConnected = !!st?.connected
          if (!isConnected){
            const role = myRole || ''
            if (role === 'admin' || role === 'user'){
              const base = role === 'admin' ? '/admin' : '/user'
              if (confirm('WhatsApp is not connected. Open the Connect page now?')){
                navigate(`${base}/inbox/connect`)
              }
            } else if (role === 'manager'){
              alert('WhatsApp session is not connected. Please ask the Admin or User to connect WhatsApp from their panel (Inbox → Connect).')
            } else if (role === 'agent'){
              alert('WhatsApp session is not connected. Please ask your Admin/User to connect WhatsApp from Inbox → Connect.')
            } else {
              if (confirm('WhatsApp is not connected. Open the Connect page?')){
                navigate('/user/inbox/connect')
              }
            }
          } else {
            // Connected but transient send failure – guide user to retry
            alert('Message could not be sent due to a temporary connection hiccup. Please try again.')
          }
        }catch{
          // If status check fails, fall back to prompt
          if (confirm('WhatsApp might not be connected. Open the Connect page now?')){
            navigate('/user/inbox/connect')
          }
        }
      } else if (/send-transient/i.test(msg)){
        alert('Message could not be sent due to a temporary connection hiccup. Please try again.')
      } else {
        alert(msg || 'Failed to send message')
      }
      setMessages(prev => prev.filter(m => m?.key?.id !== tempId))
      return
    }
    setText('')
    // Quick refresh; socket will append near-instantly as well
    await loadMessages(activeJid)
    setTimeout(()=> loadMessages(activeJid), 900)
  }

  async function loadEarlier(){
    if(!activeJid || !hasMore || !beforeId) return
    const el = listRef.current
    const prevScrollHeight = el ? el.scrollHeight : 0
    const prevScrollTop = el ? el.scrollTop : 0
    setLoadingMore(true)
    try{
      const r = await apiGet(`/api/wa/messages?jid=${encodeURIComponent(activeJid)}&limit=50&beforeId=${encodeURIComponent(beforeId)}`)
      const items = r?.items || []
      if (items.length){
        setMessages(prev => [...items, ...prev])
        setHasMore(!!r?.hasMore)
        setBeforeId(r?.nextBeforeId || null)
        // Preserve scroll position after prepending
        setTimeout(()=>{
          if (!el) return
          const newScrollHeight = el.scrollHeight
          el.scrollTop = (newScrollHeight - prevScrollHeight) + prevScrollTop
        }, 0)
      }else{
        setHasMore(false)
        setBeforeId(null)
      }
    }finally{ setLoadingMore(false) }
  }

  async function onUpload(e){
    try{
      const input = e.target
      const files = Array.from(input.files||[]).slice(0,30)
      setShowAttach(false)
      if(!activeJid || files.length===0) return
      setUploading(true)
      const fd = new FormData()
      fd.append('jid', activeJid)
      for(const f of files) fd.append('files', f)
      await apiUpload('/api/wa/send-media', fd)
      await loadMessages(activeJid)
    }catch(err){
      const msg = err?.message || 'Failed to upload'
      if (/403/.test(String(msg))){
        alert('Not allowed to send to this chat. If you are an agent, make sure the chat is assigned to you.')
      }else{
        alert(msg)
      }
    }finally{
      setUploading(false)
      try{ e.target.value='' }catch{}
    }
  }

  // Voice recording handlers
  function formatJid(j){
    if(!j) return ''
    return j.replace(/@.*$/, '')
  }

  const MIN_MS = 800
  const MIN_BYTES = 1024
  const MAX_MS = 2 * 60 * 1000 // 2 minutes hard cap

  async function startRecording(){
    if(!activeJid) return
    if (myRole === 'agent' && !canSend){
      alert('This chat is not assigned to you. Ask the admin/user to assign it to you to reply.')
      return
    }
    // Basic capability checks with fallback to native capture
    if (typeof window === 'undefined' || !window.MediaRecorder || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia){
      try{ (audioInputRef.current || document.getElementById('wa-audio-input'))?.click() }catch{}
      return
    }
    recStartXRef.current = null
    let stream
    try{
      stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    }catch(err){
      alert('Microphone permission denied. Please allow microphone access to record voice messages.')
      return
    }
    // Prefer Opus in OGG for better WhatsApp compatibility
    const preferredTypes = [
      'audio/ogg; codecs=opus',
      'audio/webm; codecs=opus',
      'audio/ogg',
      'audio/webm',
      'audio/mp4',
    ]
    let mimeType = ''
    for (const t of preferredTypes){
      if (window.MediaRecorder && MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(t)) { mimeType = t; break }
    }
    const mr = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
    chunksRef.current = []
    mr.ondataavailable = (e)=>{ if(e.data && e.data.size>0){ chunksRef.current.push(e.data) } }
    let stopped = false
    mr.onstop = async ()=>{
      if (stopped) return; stopped = true
      // Give time for the final 'dataavailable' to fire after stop
      await new Promise(res => setTimeout(res, 20))
      const blobType = mimeType || 'audio/webm'
      const elapsedMs = Date.now() - (recStartedAtRef.current || Date.now())
      const totalSize = chunksRef.current.reduce((s,b)=> s + (b?.size||0), 0)
      console.debug('[voice] stop:', { elapsedMs, totalSize, blobType })
      if (!recCancelRef.current && elapsedMs >= MIN_MS && totalSize >= MIN_BYTES){
        try{
          const blob = new Blob(chunksRef.current, { type: blobType })
          let ext = 'webm'
          if (blobType.includes('ogg')) ext = 'ogg'
          else if (blobType.includes('webm')) ext = 'webm'
          else if (blobType.includes('mp4')) ext = 'm4a'
          const file = new File([blob], `voice.${ext}`, { type: blobType })
          // Optimistic local bubble
          const localUrl = URL.createObjectURL(blob)
          const estSeconds = Math.max(1, Math.round(elapsedMs/1000))
          const tempId = 'temp:voice:' + Date.now()
          const optimistic = {
            key: { id: tempId, fromMe: true },
            message: { audioMessage: { mimetype: blobType, seconds: estSeconds, localUrl } },
            messageTimestamp: Math.floor(Date.now()/1000),
            status: 'sending'
          }
          setMessages(prev => [...prev, optimistic])
          setTimeout(()=> endRef.current?.scrollIntoView({ behavior:'smooth' }), 0)
          const fd = new FormData()
          fd.append('jid', activeJid)
          fd.append('voice', file)
          const r = await apiUpload('/api/wa/send-voice', fd)
          if (r && r.message && r.message.key && r.message.key.id){
            reconcileTempVoice(tempId, r.message, localUrl)
          } else {
            // Fallback: refresh
            setMessages(prev => prev.filter(m => m?.key?.id !== tempId))
            try{ URL.revokeObjectURL(localUrl) }catch{}
            loadMessages(activeJid)
          }
        }catch(err){
          console.error('send-voice failed', err)
          const msg = (err && err.message) ? err.message : 'Failed to send voice message'
          if (/403/.test(msg)){
            alert('Not allowed to send to this chat. If you are an agent, make sure the chat is assigned to you.')
          }else{
            alert(msg)
          }
        }
      }else{
        // too short or empty: show brief visual cue
        setRecWillCancel(true)
        setTimeout(()=> setRecWillCancel(false), 900)
      }
      // stop all tracks
      stream.getTracks().forEach(t=>t.stop())
    }
    mediaRecorderRef.current = mr
    // Use a 1s timeslice so 'dataavailable' fires periodically and the last chunk reliably arrives
    mr.start(250)
    setRecording(true)
    setRecSeconds(0)
    recTimerRef.current = setInterval(()=> setRecSeconds(s=>s+1), 1000)
    // auto stop after MAX_MS to avoid stuck recording
    setTimeout(()=>{ if (mediaRecorderRef.current === mr && recording) stopRecording(false) }, MAX_MS)
    recCancelRef.current = false
    setRecDragging(true)
    setRecWillCancel(false)
    recStartedAtRef.current = Date.now()
    // haptic feedback on start
    try{ if (navigator.vibrate) navigator.vibrate(10) }catch{}
    // bind document listeners for slide-to-cancel
    if (!recDocHandlersBoundRef.current){
      document.addEventListener('mousemove', onRecDocMove, true)
      document.addEventListener('mouseup', onRecDocUp, true)
      document.addEventListener('touchmove', onRecDocMove, { passive:false, capture:true })
      document.addEventListener('touchend', onRecDocUp, { capture:true })
      document.addEventListener('pointercancel', onRecDocUp, true)
      window.addEventListener('blur', onRecDocUp, true)
      document.addEventListener('visibilitychange', ()=>{ if (document.hidden) onRecDocUp() }, true)
      recDocHandlersBoundRef.current = true
    }
  }

  function stopRecording(cancel=false){
    if(mediaRecorderRef.current && recording){
      recCancelRef.current = !!cancel
      try { mediaRecorderRef.current.requestData && mediaRecorderRef.current.requestData() } catch {}
      mediaRecorderRef.current.stop()
      setRecording(false)
      setRecDragging(false)
      setRecWillCancel(false)
      if (recTimerRef.current){ clearInterval(recTimerRef.current); recTimerRef.current = null }
      // haptic on cancel
      try{ if (cancel && navigator.vibrate) navigator.vibrate(5) }catch{}
      // unbind doc listeners
      if (recDocHandlersBoundRef.current){
        document.removeEventListener('mousemove', onRecDocMove, true)
        document.removeEventListener('mouseup', onRecDocUp, true)
        document.removeEventListener('touchmove', onRecDocMove, true)
        document.removeEventListener('touchend', onRecDocUp, true)
        window.removeEventListener('blur', onRecDocUp, true)
        document.removeEventListener('visibilitychange', ()=>{ if (document.hidden) onRecDocUp() }, true)
        recDocHandlersBoundRef.current = false
      }
    }
  }

  function getClientX(e){
    if (e.touches && e.touches[0]) return e.touches[0].clientX
    if (e.changedTouches && e.changedTouches[0]) return e.changedTouches[0].clientX
    return e.clientX
  }

  function onRecDocMove(e){
    if (!recording || !recDragging) return
    // prevent page scroll while sliding on mobile
    if (e.cancelable) e.preventDefault()
    const x = getClientX(e)
    if (recStartXRef.current == null) recStartXRef.current = x
    const dx = x - recStartXRef.current
    // slide left to cancel
    const willCancel = dx < -80
    setRecWillCancel(willCancel)
  }

  function onRecDocUp(_e){
    if (!recording) return
    setRecDragging(false)
    stopRecording(recWillCancel)
  }

  const activeChat = useMemo(()=> chats.find(c=>c.id===activeJid) || null, [chats, activeJid])
  const canSend = useMemo(()=>{
    if (!activeJid) return false
    if (myRole !== 'agent') return true
    const ownerId = activeChat && activeChat.owner ? (activeChat.owner.id || activeChat.owner._id) : null
    if (!ownerId) return false
    return String(ownerId) === String(myId || '')
  }, [activeJid, activeChat, myRole, myId])

  const EMOJIS = ['😀','😁','😂','🤣','😊','😍','😘','😎','🤩','👍','🙏','🎉','🔥','💯','✨','🥰','😇','😅','🤝','✅']

  // WhatsApp-like icons
  function MicIcon({ size=26 }){
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
        <path d="M12 14c1.657 0 3-1.343 3-3V6a3 3 0 1 0-6 0v5c0 1.657 1.343 3 3 3Z" stroke="currentColor" strokeWidth="1.8"/>
        <path d="M5 11a7 7 0 0 0 14 0" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
        <path d="M12 18v3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
      </svg>
    )
  }
  function StopIcon({ size=18 }){
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg" aria-hidden>
        <rect x="6" y="6" width="12" height="12" rx="2"/>
      </svg>
    )
  }
  function XIcon({ size=18 }){
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
        <path d="M7 7l10 10M17 7L7 17" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
      </svg>
    )
  }

  function PlayIcon({ size=18 }){
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg" aria-hidden>
        <path d="M8 5v14l11-7-11-7z"/>
      </svg>
    )
  }
  function PauseIcon({ size=18 }){
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg" aria-hidden>
        <rect x="7" y="5" width="4" height="14" rx="1"/>
        <rect x="13" y="5" width="4" height="14" rx="1"/>
      </svg>
    )
  }

  function PhotoIcon({ size=18 }){
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
        <rect x="3" y="4.5" width="18" height="15" rx="2" stroke="currentColor" strokeWidth="1.6"/>
        <circle cx="8.5" cy="9.5" r="2" stroke="currentColor" strokeWidth="1.6"/>
        <path d="M4.5 18l5.5-5.5L14 16l2.5-2.5L20 18" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    )
  }
  function VideoIcon({ size=18 }){
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
        <rect x="3.5" y="6" width="13" height="12" rx="2" stroke="currentColor" strokeWidth="1.6"/>
        <path d="M17 9.5l4.5-2.5v10l-4.5-2.5v-5z" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinejoin="round"/>
      </svg>
    )
  }
  function FileIcon({ size=18 }){
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
        <path d="M14 3H8.5A2.5 2.5 0 0 0 6 5.5v13A2.5 2.5 0 0 0 8.5 21h7A2.5 2.5 0 0 0 18 18.5V8l-4-5z" stroke="currentColor" strokeWidth="1.6"/>
        <path d="M14 3v5h5" stroke="currentColor" strokeWidth="1.6"/>
        <path d="M9.5 13h6M9.5 16h6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
      </svg>
    )
  }

  function addEmoji(e){ setText(t => t + e) }

  function secondsToMMSS(s){
    const m = Math.floor(s/60).toString().padStart(2,'0')
    const sec = (s%60).toString().padStart(2,'0')
    return `${m}:${sec}`
  }

  function normalizeTs(ts){
    try{
      if (ts == null) return null
      if (typeof ts === 'number') return ts
      if (typeof ts === 'bigint') return Number(ts)
      if (typeof ts === 'string'){
        const n = Number(ts)
        if (!Number.isNaN(n)) return n
        const d = Date.parse(ts)
        return Number.isNaN(d) ? null : Math.floor(d/1000)
      }
      if (typeof ts === 'object'){
        if (typeof ts.toNumber === 'function') return ts.toNumber()
        if (typeof ts.seconds === 'number') return ts.seconds
        if (typeof ts._seconds === 'number') return ts._seconds
        if (typeof ts.low === 'number' && typeof ts.high === 'number'){
          // Long-like: reconstruct if safe
          return ts.low + ts.high * 2**32
        }
      }
      return null
    }catch{ return null }
  }

  function fmtTime(ts){
    const n = normalizeTs(ts)
    if (n == null) return ''
    // If appears to be milliseconds already, keep; else convert from seconds
    const ms = n > 1e12 ? n : n * 1000
    const d = new Date(ms)
    if (isNaN(d.getTime())) return ''
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

  // Notification + ringtone helpers
  function getChatNameByJid(j){
    const c = chats.find(x=>x.id===j)
    return c?.name || formatJid(j)
  }
  function previewText(content){
    try{
      if (!content) return 'New message'
      if (content.conversation) return content.conversation
      if (content.extendedTextMessage) return content.extendedTextMessage.text || 'New message'
      if (content.imageMessage) return '[Image]'
      if (content.videoMessage) return '[Video]'
      if (content.documentMessage) return content.documentMessage.fileName ? `📄 ${content.documentMessage.fileName}` : '[Document]'
      if (content.audioMessage) return '[Voice message]'
      if (content.locationMessage) return '[Location]'
      return 'New message'
    }catch{ return 'New message' }
  }
  function playDing(){
    try{
      const ctx = new (window.AudioContext || window.webkitAudioContext)()
      const o = ctx.createOscillator(); const g = ctx.createGain()
      o.type = 'sine'; o.frequency.setValueAtTime(880, ctx.currentTime)
      g.gain.setValueAtTime(0.0001, ctx.currentTime)
      g.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime+0.01)
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime+0.35)
      o.connect(g); g.connect(ctx.destination)
      o.start(); o.stop(ctx.currentTime+0.4)
    }catch{}
  }
  function notifyIncoming(jid, rawMessage){
    const content = unwrapMessage(rawMessage?.message)
    const title = getChatNameByJid(jid)
    const body = previewText(content)
    if (soundOn) playDing()
    try{
      if (typeof Notification!=='undefined' && Notification.permission==='granted'){
        const n = new Notification(title || 'New message', { body })
        n.onclick = ()=>{ try{ window.focus(); const qs=new URLSearchParams(location.search); qs.set('jid', jid); navigate(`${location.pathname}?${qs.toString()}`, { replace:false }) }catch{} }
      }
    }catch{}
  }

  async function ensureMediaUrl(jid, id){
    const key = `${jid}:${id}`
    if (mediaUrlCacheRef.current.has(key)) return mediaUrlCacheRef.current.get(key)
    try{
      const blob = await apiGetBlob(`/api/wa/media?jid=${encodeURIComponent(jid)}&id=${encodeURIComponent(id)}`)
      const url = URL.createObjectURL(blob)
      mediaUrlCacheRef.current.set(key, url)
      return url
    }catch{ return null }
  }

  function Ticks({ isMe, status }){
    if (!isMe) return null
    const st = status || 'sent' // default to 'sent' if unknown
    const Blue = '#4fb3ff'
    const Grey = '#9aa4b2'
    const color = st === 'read' ? Blue : Grey
    const single = (
      <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden fill="none" style={{display:'inline-block', verticalAlign:'middle'}}>
        <path d="M20 6 9 17l-5-5" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    )
    const doubleTicks = (
      <span style={{display:'inline-flex', gap:2}}>
        <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden fill="none">
          <path d="M20 6 9 17l-5-5" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
        <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden fill="none" style={{marginLeft:-6}}>
          <path d="M22 8 11 19l-3-3" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </span>
    )
    if (st === 'sent') return <span style={{ marginLeft: 6 }}>{single}</span>
    if (st === 'delivered') return <span style={{ marginLeft: 6 }}>{doubleTicks}</span>
    if (st === 'read') return <span style={{ marginLeft: 6 }}>{doubleTicks}</span>
    // fallback
    return <span style={{ marginLeft: 6 }}>{single}</span>
  }

  function AudioBubble({ jid, msg, content, ensureMediaUrl }){
    const [url, setUrl] = useState(null)
    const [loading, setLoading] = useState(true)
    const [duration, setDuration] = useState(0)
    const [peaks, setPeaks] = useState([])
    const [playing, setPlaying] = useState(false)
    const [progress, setProgress] = useState(0) // 0..1
    const audioRef = useRef(null)
    const canvasRef = useRef(null)
    const containerRef = useRef(null)
    const [containerWidth, setContainerWidth] = useState(240)

    // Load URL (support optimistic localUrl for immediate playback)
    useEffect(()=>{
      let alive = true
      const local = content?.audioMessage?.localUrl
      if (local){ setUrl(local); setLoading(false); return ()=>{ alive=false }
      }
      const load = async ()=>{
        const u = await ensureMediaUrl(jid, msg?.key?.id)
        if (!alive) return
        setUrl(u)
      }
      load()
      return ()=>{ alive = false }
    },[jid, msg?.key?.id, content?.audioMessage?.localUrl])

    // Build audio element and decode peaks
    useEffect(()=>{
      if (!url) return
      let cancelled = false
      const a = new Audio()
      a.src = url
      a.preload = 'metadata'
      a.addEventListener('timeupdate', ()=>{
        if (!a.duration || isNaN(a.duration)) return
        setProgress(a.currentTime / a.duration)
      })
      a.addEventListener('ended', ()=>{ setPlaying(false); setProgress(1) })
      audioRef.current = a

      const compute = async ()=>{
        setLoading(true)
        // Use cache if present
        if (waveformCacheRef.current.has(url)){
          const { peaks, duration } = waveformCacheRef.current.get(url)
          if (!cancelled){ setPeaks(peaks); setDuration(duration); setLoading(false) }
          return
        }
        try{
          const res = await fetch(url)
          const buf = await res.arrayBuffer()
          const ctx = new (window.AudioContext || window.webkitAudioContext)()
          const audioBuf = await ctx.decodeAudioData(buf)
          const ch = audioBuf.numberOfChannels > 0 ? audioBuf.getChannelData(0) : new Float32Array()
          const len = 60 // number of bars, WhatsApp-like compact waveform
          const block = Math.floor(ch.length / len) || 1
          const peaksArr = new Array(len).fill(0).map((_,i)=>{
            let sum = 0
            const start = i * block
            for (let j=0;j<block && start+j<ch.length;j++) sum += Math.abs(ch[start+j])
            return sum / block
          })
          // Normalize
          const max = Math.max(0.01, ...peaksArr)
          const norm = peaksArr.map(v => v / max)
          const dur = audioBuf.duration
          waveformCacheRef.current.set(url, { peaks: norm, duration: dur })
          if (!cancelled){ setPeaks(norm); setDuration(dur) }
        }catch{
          // Fallback: show simple bar if decode fails
          const fallback = new Array(40).fill(0).map((_,i)=> (Math.sin(i/3)+1)/2 )
          waveformCacheRef.current.set(url, { peaks: fallback, duration: 0 })
          if (!cancelled){ setPeaks(fallback); setDuration(0) }
        }finally{ if (!cancelled) setLoading(false) }
      }
      compute()
      return ()=>{
        cancelled = true
        try{ a.pause() }catch{}
        try{ a.removeAttribute('src'); a.load?.() }catch{}
        try{ a.removeEventListener('timeupdate', ()=>{}) }catch{}
        try{ a.removeEventListener('ended', ()=>{}) }catch{}
      }
    },[url])

    // Observe container width for responsive canvas sizing (with fallback if ResizeObserver is unavailable)
    useEffect(()=>{
      if (!containerRef.current) return
      const el = containerRef.current
      const update = ()=>{ try{ setContainerWidth(el.clientWidth || 240) }catch{} }
      let ro = null
      try{
        if (typeof ResizeObserver !== 'undefined'){
          ro = new ResizeObserver((entries)=>{
            const cr = entries[0]?.contentRect
            if (cr && cr.width){ setContainerWidth(cr.width) }
          })
          ro.observe(el)
        } else {
          window.addEventListener('resize', update)
        }
      }catch{ /* ignore */ }
      // initial measure
      update()
      return ()=>{ try{ ro ? ro.disconnect() : window.removeEventListener('resize', update) }catch{} }
    },[])

    // Draw waveform
    useEffect(()=>{
      const canvas = canvasRef.current
      if (!canvas || peaks.length === 0) return
      const dpr = window.devicePixelRatio || 1
      const height = 36
      const width = Math.max(180, Math.floor(containerWidth))
      canvas.width = width * dpr
      canvas.height = height * dpr
      canvas.style.width = width + 'px'
      canvas.style.height = height + 'px'
      const ctx = canvas.getContext('2d')
      ctx.scale(dpr, dpr)
      ctx.clearRect(0,0,width,height)
      const barW = Math.max(2, Math.floor(width / (peaks.length*1.5)))
      const gap = Math.max(1, Math.floor(barW/2))
      const baseY = height/2
      const color = '#9aa4b2'
      const colorActive = '#4fb3ff'
      const progressBars = Math.floor(peaks.length * progress)
      for(let i=0;i<peaks.length;i++){
        const p = Math.max(0.15, peaks[i])
        const h = p * (height-6)
        const x = i * (barW + gap)
        ctx.fillStyle = i <= progressBars ? colorActive : color
        ctx.fillRect(x, baseY - h/2, barW, h)
      }
    },[peaks, progress, containerWidth])

    function toggle(){
      const a = audioRef.current
      if (!a) return
      if (a.paused){ a.play().then(()=> setPlaying(true)).catch(()=>{}) }
      else { a.pause(); setPlaying(false) }
    }

    return (
      <div ref={containerRef} style={{display:'grid', gridTemplateColumns:'36px 1fr auto', alignItems:'center', gap:8, width:'clamp(220px, 60vw, 420px)'}}>
        <button className="btn secondary" onClick={toggle} aria-label={playing ? 'Pause voice message' : 'Play voice message'} title={playing ? 'Pause' : 'Play'} style={{width:36,height:36,borderRadius:999,display:'grid',placeItems:'center'}}>
          {playing ? <PauseIcon /> : <PlayIcon />}
        </button>
        <div onClick={toggle} style={{cursor:'pointer'}}>
          <canvas ref={canvasRef} />
        </div>
        <div style={{fontSize:12, opacity:0.8, minWidth:44, textAlign:'right'}}>{duration? secondsToMMSS(Math.floor(duration)) : ''}</div>
      </div>
    )
  }

  function ImageBubble({ jid, msg, content, ensureMediaUrl }){
    const [url, setUrl] = useState(null)
    const caption = content?.imageMessage?.caption || ''
    useEffect(()=>{
      let alive = true
      const load = async ()=>{
        const u = await ensureMediaUrl(jid, msg?.key?.id)
        if (alive) setUrl(u)
      }
      load()
      return ()=>{ alive = false }
    },[jid, msg?.key?.id])
    function isFileNameLike(s){
      try{
        const t = String(s||'').trim()
        if (!t) return false
        if (/\.(jpe?g|png|gif|bmp|webp|heic|heif|tiff|svg)$/i.test(t)) return true
        if (/^(img[-_]?|image[-_]?|photo[-_]?|screenshot[-_]?)/i.test(t)) return true
        return false
      }catch{ return false }
    }
    const showCaption = caption && !isFileNameLike(caption)
    return (
      <div style={{display:'grid', gap:6}}>
        {url ? (
          <a href={url} target="_blank" rel="noreferrer">
            <img src={url} alt="image" style={{maxWidth:'280px', height:'auto', borderRadius:6}} />
          </a>
        ) : (
          <span style={{ opacity:0.7 }}>[image]</span>
        )}
        {showCaption && <div style={{opacity:0.9}}>{caption}</div>}
      </div>
    )
  }

  function LocationBubble({ content }){
    const loc = content?.locationMessage || {}
    const lat = loc.degreesLatitude
    const lng = loc.degreesLongitude
    const name = loc.name || 'Location'
    const address = loc.address || ''
    const url = (typeof lat === 'number' && typeof lng === 'number') ? `https://www.google.com/maps?q=${lat},${lng}` : null
    const [copied, setCopied] = useState(false)
    function copyCoords(){
      try{
        const txt = (typeof lat === 'number' && typeof lng === 'number') ? `${lat.toFixed(6)}, ${lng.toFixed(6)}` : ''
        if (!txt) return
        if (navigator.clipboard && navigator.clipboard.writeText){ navigator.clipboard.writeText(txt) }
        else {
          const ta = document.createElement('textarea')
          ta.value = txt
          document.body.appendChild(ta)
          ta.select()
          try{ document.execCommand('copy') }catch{}
          document.body.removeChild(ta)
        }
        setCopied(true)
        setTimeout(()=> setCopied(false), 1200)
      }catch{}
    }
    return (
      <div style={{display:'grid', gap:6}}>
        <div style={{display:'flex', alignItems:'center', gap:8}}>
          <span>📍</span>
          <div style={{fontWeight:600}}>{name}</div>
        </div>
        {address && <div style={{opacity:0.9}}>{address}</div>}
        {(typeof lat === 'number' && typeof lng === 'number') && (
          <div style={{display:'flex', alignItems:'center', gap:8}}>
            <div style={{fontSize:12, opacity:0.8}}>({lat.toFixed(6)}, {lng.toFixed(6)})</div>
            <button className="btn secondary small" onClick={copyCoords} title="Copy coordinates" aria-label="Copy coordinates" style={{padding:'4px 8px'}}>{copied ? 'Copied' : 'Copy'}</button>
          </div>
        )}
        {url && (
          <a href={url} target="_blank" rel="noreferrer" className="btn secondary" style={{justifySelf:'start'}}>Open in Maps</a>
        )}
      </div>
    )
  }

  // UI helpers
  const MOBILE_HDR_H = 56
  const showListScreen = isMobile && !activeJid
  const showChatScreen = isMobile && !!activeJid

  // Mobile headers
  const mobileListHeader = (
    <div style={{position:'sticky', top:0, zIndex:1200, display:isMobile ? 'flex' : 'none', alignItems:'center', gap:10, height:MOBILE_HDR_H, background:'var(--wa-header)', borderBottom:'1px solid var(--border)', padding:'8px 10px'}}>
      <button className="btn secondary" onClick={()=> navigate(-1)} aria-label="Back" title="Back" style={{width:36,height:36,padding:0,display:'grid',placeItems:'center'}}>←</button>
      <div style={{fontWeight:800}}>Chats</div>
      <div style={{marginLeft:'auto'}}>
        <button className="btn secondary" onClick={()=> loadChats()} title="Refresh" aria-label="Refresh" style={{width:36,height:36,padding:0,display:'grid',placeItems:'center'}}>↻</button>
      </div>
    </div>
  )

  const mobileChatHeader = (
    <>
      <div className="wa-chat-header" style={{ display: isMobile ? 'flex' : 'none' }}>
        <button className="btn secondary" onClick={()=>{ const qs=new URLSearchParams(location.search); qs.delete('jid'); navigate(`${location.pathname}?${qs.toString()}`.replace(/\?$/,''), { replace:true }) }} aria-label="Back" title="Back">←</button>
        <Avatar name={activeChat?.name || formatJid(activeJid)} />
        <div style={{display:'grid'}}>
          <div style={{fontWeight:800}}>{activeChat?.name || formatJid(activeJid)}</div>
          {activeChat?.owner?.name && <div className="helper" style={{fontSize:11}}>Assigned: {activeChat.owner.name}</div>}
          {activeJid && (
            <div className="helper" style={{fontSize:11}}>
              {countryNameFromJid(activeJid) && <span style={{marginRight:6, padding:'2px 6px', border:'1px solid var(--border)', borderRadius:999}}>{countryNameFromJid(activeJid)}</span>}
              {formatJid(activeJid)}
            </div>
          )}
        </div>
        <div style={{marginLeft:'auto', display:'flex', gap:6}}>
          {myRole === 'agent' ? (
            <button className="btn success" onClick={goToSubmitOrder} title="Submit Order" aria-label="Submit Order">Submit Order</button>
          ) : (
            <div ref={chatMenuRef} style={{position:'relative'}}>
              <button className="btn secondary" onClick={()=> setShowChatMenu(s=>!s)} title="Chat menu" aria-label="Chat menu">⋮</button>
              {showChatMenu && (
                <div className="dropdown-menu" style={{right:0}}>
                  <button onClick={openNotes}>Notes</button>
                  {myRole !== 'agent' && (
                    <button onClick={() => setShowAssignModal(true)}>Submit to Agent</button>
                  )}
                  <button onClick={goToSubmitOrder}>Submit Order</button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  )

  // Auto-grow textarea
  const inputRef = useRef(null)
  function autosize(){ const ta = inputRef.current; if (!ta) return; ta.style.height = 'auto'; const max = 140; ta.style.height = Math.min(max, ta.scrollHeight) + 'px' }
  useEffect(()=>{ autosize() }, [text])

  // RENDER
  if (showListScreen){
    return (
      <div className="full-viewport wa-layout wa-wallpaper" style={{ height:'100dvh', width:'100vw', overflow:'hidden' }}>
        {mobileListHeader}
        <div className="wa-chatlist open" style={{borderRight:'none'}}>
          {/* New Chat (Mobile) - filters removed */}
          <div style={{position:'sticky', top:0, zIndex:1100, background:'var(--wa-header)', borderBottom:'1px solid var(--border)', padding:'8px 10px', display:'flex', alignItems:'center', justifyContent:'flex-end'}}>
            {myRole !== 'agent' && (
              <div>
                <button className="btn small" onClick={()=> setShowNewChat(s=>!s)}>New Chat</button>
              </div>
            )}
          </div>
          {showNewChat && (
            <div style={{padding:'8px 10px', borderBottom:'1px solid var(--border)', display:'grid', gridTemplateColumns:'1fr auto auto', gap:6}}>
              <input className="input" value={newChatPhone} onChange={e=> setNewChatPhone(e.target.value)} placeholder="Enter phone e.g. 923001234567" onKeyDown={e=>{ if(e.key==='Enter') createNewChat() }} />
              <button className="btn small" onClick={createNewChat}>Start</button>
              <button className="btn secondary small" onClick={()=>{ setShowNewChat(false); setNewChatPhone('') }}>Cancel</button>
            </div>
          )}
          {/* Chats list full-screen */}
          {filteredChats.length === 0 ? (
            <div style={{padding:16, display:'grid', gap:10, justifyItems:'center', textAlign:'center'}}>
              <div style={{fontSize:28}}>📭</div>
              <div style={{fontWeight:700}}>No chats yet</div>
              <button className="btn secondary" onClick={loadChats} style={{marginTop:4}}>Refresh</button>
            </div>
          ) : (
            filteredChats.map(c=> {
              const country = countryNameFromJid(c.id)
              const label = c.name ? c.name : formatJid(c.id)
              return (
              <div key={c.id} onClick={()=>{ const qs=new URLSearchParams(location.search); qs.set('jid', c.id); navigate(`${location.pathname}?${qs.toString()}`, { replace:false }) }} className={`wa-chat-item ${activeJid === c.id ? 'active' : ''}`}>
                <Avatar name={c.name || formatJid(c.id)} />
                <div className="wa-chat-preview">
                  <div style={{display:'flex', justifyContent:'space-between', gap:8}}>
                    <div className="wa-chat-name">
                      {country && <span className="helper" style={{fontSize:11, marginRight:6, opacity:0.9, padding:'2px 6px', border:'1px solid var(--border)', borderRadius:999}}>{country}</span>}
                      {label}
                    </div>
                    <div className="helper" style={{fontSize:12}}>{c.lastTs ? new Date(c.lastTs).toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' }) : ''}</div>
                  </div>
                  <div className="helper" style={{overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>{c.preview || ''}</div>
                  {myRole !== 'agent' && c.owner?.name && <div className="helper" style={{fontSize:11}}>Assigned: {c.owner.name}</div>}
                </div>
                {(c.unread || (typeof c.unreadCount==='number' && c.unreadCount>0)) ? <div style={{width:10,height:10,borderRadius:999,background:'var(--wa-accent)'}}/> : null}
              </div>
              )
            })
          )}
        </div>
      </div>
    )
  }

  // Chat screen (mobile) or split (desktop)
  return (
    <div className="wa-layout wa-wallpaper">
      {/* Left: Chats List (Desktop) */}
      <div className="wa-chatlist" style={{ display: isMobile ? 'none' : 'block' }}>
        {/* Filters + New Chat (Desktop) */}
        <div style={{position:'sticky', top:0, zIndex:10, background:'var(--wa-header)', borderBottom:'1px solid var(--border)', padding:'8px 12px', display:'flex', alignItems:'center', gap:8, justifyContent:'space-between'}}>
          <div style={{display:'flex', gap:6, flexWrap:'wrap'}}>
            {['all','unread','read'].map(k=> (
              <button key={k} className={`btn small ${chatFilter===k? 'success':'secondary'}`} onClick={()=> setChatFilter(k)}>{k[0].toUpperCase()+k.slice(1)}</button>
            ))}
          </div>
          {myRole !== 'agent' && (
            <div>
              <button className="btn small" onClick={()=> setShowNewChat(s=>!s)}>New Chat</button>
            </div>
          )}
        </div>
        {showNewChat && (
          <div style={{padding:'8px 12px', borderBottom:'1px solid var(--border)', display:'grid', gridTemplateColumns:'1fr auto auto', gap:6}}>
            <input className="input" value={newChatPhone} onChange={e=> setNewChatPhone(e.target.value)} placeholder="Enter phone e.g. 923001234567" onKeyDown={e=>{ if(e.key==='Enter') createNewChat() }} />
            <button className="btn small" onClick={createNewChat}>Start</button>
            <button className="btn secondary small" onClick={()=>{ setShowNewChat(false); setNewChatPhone('') }}>Cancel</button>
          </div>
        )}
        {filteredChats.length === 0 ? (
          <div style={{padding:16, display:'grid', gap:10, justifyItems:'center', textAlign:'center'}}>
            <div style={{fontSize:28}}>📭</div>
            <div style={{fontWeight:700}}>No chats yet</div>
            <button className="btn secondary" onClick={loadChats} style={{marginTop:4}}>Refresh</button>
          </div>
        ) : (
          filteredChats.map(c=> {
            const country = countryNameFromJid(c.id)
            const label = c.name ? c.name : formatJid(c.id)
            return (
              <div key={c.id} onClick={()=>{ const qs=new URLSearchParams(location.search); qs.set('jid', c.id); navigate(`${location.pathname}?${qs.toString()}`, { replace:false }) }} className={`wa-chat-item ${activeJid === c.id ? 'active' : ''}`}>
                <Avatar name={c.name || formatJid(c.id)} />
                <div className="wa-chat-preview">
                  <div style={{display:'flex', justifyContent:'space-between', gap:8}}>
                    <div className="wa-chat-name">
                      {country && <span className="helper" style={{fontSize:11, marginRight:6, opacity:0.9, padding:'2px 6px', border:'1px solid var(--border)', borderRadius:999}}>{country}</span>}
                      {label}
                    </div>
                    <div className="helper" style={{fontSize:12}}>{c.lastTs ? new Date(c.lastTs).toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' }) : ''}</div>
                  </div>
                  <div className="helper" style={{overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>{c.preview || ''}</div>
                  {myRole !== 'agent' && c.owner?.name && <div className="helper" style={{fontSize:11}}>Assigned: {c.owner.name}</div>}
                </div>
                {(c.unread || (typeof c.unreadCount==='number' && c.unreadCount>0)) ? <div style={{width:10,height:10,borderRadius:999,background:'var(--wa-accent)'}}/> : null}
              </div>
            )
          })
        )}
      </div>

      {/* Right: Active Chat */}
      <div className="wa-messages-container" style={{display:'flex', flexDirection:'column', minHeight: '100dvh', marginLeft: isMobile ? 0 : 360}}>
        {mobileChatHeader}
        {!activeJid ? (
          <div style={{display:'grid', gap:12, justifyItems:'center', height:'100%', alignContent:'center', opacity:.7}}>
            <div style={{fontSize:48}}>💬</div>
            <div style={{fontSize:18, color:'var(--muted)'}}>Select a chat to view messages</div>
          </div>
        ) : (
          <>
            {/* Desktop Header */}
            <div className="wa-chat-header" style={{ display: isMobile ? 'none' : 'flex' }}>
              <Avatar name={activeChat?.name || formatJid(activeJid)} />
              <div style={{display:'grid'}}>
                <div style={{fontWeight:800}}>{activeChat?.name || formatJid(activeJid)}</div>
                {activeChat?.owner?.name && <div className="helper" style={{fontSize:11}}>Assigned: {activeChat.owner.name}</div>}
                {activeJid && (
                  <div className="helper" style={{fontSize:11}}>
                    {countryNameFromJid(activeJid) && <span style={{marginRight:6, padding:'2px 6px', border:'1px solid var(--border)', borderRadius:999}}>{countryNameFromJid(activeJid)}</span>}
                    {formatJid(activeJid)}
                  </div>
                )}
              </div>
              <div style={{marginLeft:'auto', display:'flex', gap:6}}>
                {myRole === 'agent' ? (
                  <button className="btn success" onClick={goToSubmitOrder} title="Submit Order" aria-label="Submit Order">Submit Order</button>
                ) : (
                  <div ref={chatMenuRef} style={{position:'relative'}}>
                    <button className="btn secondary" onClick={()=> setShowChatMenu(s=>!s)} title="Chat menu" aria-label="Chat menu">⋮</button>
                    {showChatMenu && (
                      <div className="dropdown-menu" style={{right:0}}>
                        <button onClick={openNotes}>Notes</button>
                        {myRole !== 'agent' && (<button onClick={openAssign}>Submit to Agent</button>)}
                        <button onClick={goToSubmitOrder}>Submit Order</button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Messages */}
            <div ref={listRef} className={`wa-messages-list ${recording ? 'recording' : ''}`}>
              {hasMore && (
                <div style={{textAlign:'center'}}>
                  <button className="btn secondary" onClick={loadEarlier} disabled={loadingMore}>{loadingMore ? 'Loading...' : 'Load Earlier'}</button>
                </div>
              )}
              {messages.map((m, idx) => {
                const isMe = m.key?.fromMe
                const content = unwrapMessage(m.message)
                const uniqueKey = `${m?.key?.id || 'k'}-${m?.messageTimestamp || 't'}-${idx}`
                return (
                  <div key={uniqueKey} className={`wa-message-bubble ${isMe ? 'me' : 'them'}`}>
                    {content?.conversation ? (
                      <div>{content.conversation}</div>
                    ) : content?.extendedTextMessage ? (
                      <div>{content.extendedTextMessage.text}</div>
                    ) : content?.imageMessage ? (
                      <ImageBubble jid={activeJid} msg={m} content={content} ensureMediaUrl={ensureMediaUrl} />
                    ) : content?.videoMessage ? (
                      <VideoBubble jid={activeJid} msg={m} content={content} ensureMediaUrl={ensureMediaUrl} />
                    ) : content?.audioMessage ? (
                      <AudioBubble jid={activeJid} msg={m} content={content} ensureMediaUrl={ensureMediaUrl} />
                    ) : content?.documentMessage ? (
                      <DocumentBubble jid={activeJid} msg={m} content={content} ensureMediaUrl={ensureMediaUrl} />
                    ) : content?.locationMessage ? (
                      <LocationBubble content={content} />
                    ) : content?.protocolMessage ? (
                      <div style={{opacity:0.7,fontStyle:'italic'}}>[system message]</div>
                    ) : (
                      <div style={{opacity:0.7, fontStyle:'italic'}}>[Unsupported message type]</div>
                    )}
                    <div className="wa-message-meta">
                      {fmtTime(m.messageTimestamp)}
                      <Ticks isMe={isMe} status={m.status} />
                    </div>
                  </div>
                )
              })}
              <div ref={endRef} />
            </div>

            {/* Recording indicator (overlay to avoid layout shift) */}
            {recording && (
              <div className="wa-recording badge danger" aria-live="polite">
                <span style={{display:'inline-block', width:8, height:8, borderRadius:999, background:'#ef4444', marginRight:6}} />
                Recording {secondsToMMSS(recSeconds)} — slide left to cancel
              </div>
            )}

            {/* Composer */}
            <div className={`wa-composer ${recording ? 'recording' : ''}`}>
              {/* Emoji Picker */}
              <div ref={emojiRef} style={{position:'relative'}}>
                <button className="btn" onClick={()=>setShowEmoji(s=>!s)} disabled={!activeJid} style={{background:'transparent', border:'none', color:'var(--muted)', fontSize:24}}>😊</button>
                {showEmoji && (
                  <div className="dropdown-menu" style={{bottom:'100%', left:0, marginBottom:8, display:'flex', flexWrap:'wrap', gap:4, width:240}}>
                    {EMOJIS.map(e=>(<button key={e} className="btn secondary" onClick={()=>addEmoji(e)} style={{width:38,height:38}}>{e}</button>))}
                  </div>
                )}
              </div>

              {/* Attach Menu */}
              <div ref={attachRef} style={{position:'relative'}}>
                <button
                  className="btn secondary"
                  onClick={()=> setShowAttach(s=>!s)}
                  disabled={!canSend || uploading}
                  aria-label={uploading ? 'Uploading…' : 'Attach'}
                  title={uploading ? 'Uploading…' : 'Attach'}
                  style={{width:36,height:36,padding:0,display:'grid',placeItems:'center'}}
                >
                  {uploading ? <span className="spinner" /> : '📎'}
                </button>
                {/* Desktop dropdown removed; we use a unified action sheet below for both desktop and mobile */}
              </div>

              {/* Unified Attach Bottom Action Sheet (mobile + desktop) */}
              {showAttach && (
                <>
                  <div onClick={()=> setShowAttach(false)} style={{position:'fixed', inset:0, background:'rgba(0,0,0,0.45)', zIndex:9998}} />
                  <div ref={attachSheetRef} style={{position:'fixed', left:0, right:0, bottom:0, zIndex:9999, background:'var(--wa-header)', borderTopLeftRadius:16, borderTopRightRadius:16, padding:'20px 14px calc(16px + env(safe-area-inset-bottom)) 14px', boxShadow:'0 -10px 30px rgba(0,0,0,0.25)', minHeight:'42vh'}}>
                    <div style={{width:48, height:5, background:'var(--border)', borderRadius:999, margin:'0 auto 14px'}} />
                    <div className="sheet-grid">
                      <label className="sheet-option" htmlFor="wa-photo-input" onClick={()=>{ try{ (photoInputRef.current || document.getElementById('wa-photo-input'))?.click() }catch{} }}>
                        <span className="sheet-icon photo"><PhotoIcon size={24} /></span>
                        <span className="label">Photo</span>
                      </label>
                      <label className="sheet-option" htmlFor="wa-video-input" onClick={()=>{ try{ (videoInputRef.current || document.getElementById('wa-video-input'))?.click() }catch{} }}>
                        <span className="sheet-icon video"><VideoIcon size={24} /></span>
                        <span className="label">Video</span>
                      </label>
                      <label className="sheet-option" htmlFor="wa-doc-input" onClick={()=>{ try{ (docInputRef.current || document.getElementById('wa-doc-input'))?.click() }catch{} }}>
                        <span className="sheet-icon doc"><FileIcon size={24} /></span>
                        <span className="label">Document</span>
                      </label>
                    </div>
                  </div>
                </>
              )}

              {/* Recording indicator moved to overlay to prevent layout jump */}

              <textarea
                ref={inputRef}
                value={text}
                onChange={e=>setText(e.target.value)}
                onKeyDown={e=>{ if(e.key==='Enter' && !e.shiftKey){ e.preventDefault(); send() } }}
                placeholder={canSend ? 'Type a message...' : 'Chat not assigned to you'}
                rows={1}
                style={{
                  width:'100%',
                  minWidth:0,
                  opacity: (recording ? 0.6 : 1) * (canSend ? 1 : 0.65),
                  pointerEvents: (recording || !canSend) ? 'none' : 'auto'
                }}
                disabled={!canSend}
              />
              {text ? (
                <button className="btn" onClick={send} aria-label="Send message" title="Send" disabled={!canSend}>Send</button>
              ) : (
                recording ? (
                  <div style={{display:'inline-flex', gap:6, alignItems:'center'}}>
                    <button className="btn" style={{background:'#ef4444', color:'#fff'}} onClick={()=> stopRecording(true)} aria-label="Cancel recording" title="Cancel">
                      <XIcon />
                    </button>
                    <button className="btn" style={{background:'var(--wa-accent)', color:'#fff'}} onClick={()=> stopRecording(false)} aria-label="Stop recording" title="Stop">
                      <StopIcon />
                    </button>
                  </div>
                ) : (
                  <button
                    className="btn"
                    onMouseDown={startRecording}
                    onTouchStart={startRecording}
                    aria-label="Hold to record voice"
                    title="Hold to record voice"
                    style={{color:'var(--wa-accent)', opacity: canSend ? 1 : 0.5, cursor: canSend ? 'pointer' : 'not-allowed'}}
                    disabled={!canSend}
                  >
                    <MicIcon />
                  </button>
                )
              )}
            </div>
          </>
        )}
      </div>

      {/* Hidden file inputs for media upload */}
      <input
        ref={photoInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        multiple
        onChange={onUpload}
        id="wa-photo-input"
        style={{ position:'fixed', left:'-10000px', width:1, height:1, opacity:0 }}
      />
      <input
        ref={videoInputRef}
        type="file"
        accept="video/*"
        capture="environment"
        multiple
        onChange={onUpload}
        id="wa-video-input"
        style={{ position:'fixed', left:'-10000px', width:1, height:1, opacity:0 }}
      />
      <input
        ref={docInputRef}
        type="file"
        // Common docs; leave open to allow any file the backend will forward to WA
        accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation,application/zip,application/x-zip-compressed"
        multiple
        onChange={onUpload}
        id="wa-doc-input"
        style={{ position:'fixed', left:'-10000px', width:1, height:1, opacity:0 }}
      />
      {/* Hidden audio input for iOS/Safari and browsers without MediaRecorder */}
      <input
        ref={audioInputRef}
        type="file"
        accept="audio/*"
        capture
        onChange={onVoiceFile}
        id="wa-audio-input"
        style={{ position:'fixed', left:'-10000px', width:1, height:1, opacity:0 }}
      />
      {showAssignModal && (
        <div className="modal-backdrop" style={{position:'fixed', inset:0, background:'rgba(0,0,0,0.35)', display:'grid', placeItems:'center', zIndex:9999}}>
          <div className="card" role="dialog" aria-modal="true" style={{width: 'min(480px, 96vw)', maxHeight:'90vh', overflow:'auto', padding:16, display:'grid', gap:12}}>
            <div style={{display:'flex', alignItems:'center', justifyContent:'space-between'}}>
              <div style={{fontWeight:800, fontSize:18}}>Assign Chat to Agent</div>
              <button className="btn secondary" onClick={()=> setShowAssignModal(false)} aria-label="Close">✕</button>
            </div>
            <div className="helper">Select an agent to handle this conversation. Agents will only see chats assigned to them.</div>
            <input className="input" value={agentQuery} onChange={e=> setAgentQuery(e.target.value)} placeholder="Search agents by name, email, or phone" />
            <div style={{display:'grid', gap:8, maxHeight: '40vh', overflow:'auto', border:'1px solid var(--border)', borderRadius:8, padding:8}}>
              {agentsLoading && <div className="helper">Loading…</div>}
              {!agentsLoading && agents.length === 0 && <div className="helper">No agents found</div>}
              {agents.map(a=> {
                const id = a?._id || a?.id
                const label = `${a.firstName||''} ${a.lastName||''}`.trim() || a.email || 'Agent'
                return (
                  <label key={id} style={{display:'flex', alignItems:'center', gap:8, padding:'6px 8px', borderRadius:6, cursor:'pointer', background: (selectedAgent===id?'var(--panel-2)':'transparent')}}>
                    <input type="radio" name="agent" checked={selectedAgent===id} onChange={()=> setSelectedAgent(id)} />
                    <div style={{display:'grid'}}>
                      <div style={{fontWeight:600}}>{label}</div>
                      <div className="helper" style={{fontSize:12}}>{a.email || ''}{a.phone ? ` · ${a.phone}` : ''}</div>
                    </div>
                  </label>
                )
              })}
            </div>
            <div style={{display:'flex', justifyContent:'end', gap:8}}>
              <button className="btn secondary" onClick={()=> setShowAssignModal(false)}>Cancel</button>
              <button className="btn" onClick={assignAgent} disabled={!selectedAgent || agentsLoading}>Assign</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
