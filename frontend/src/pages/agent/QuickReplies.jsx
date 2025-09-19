import React, { useState, useEffect } from 'react';
import { apiGet, apiPost, apiPatch, apiDelete } from '../../api';

export default function QuickReplies() {
  const [replies, setReplies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ shortcut: '', message: '' });
  const [editing, setEditing] = useState(null); // Holds the ID of the reply being edited
  const [msg, setMsg] = useState('');

  async function loadReplies() {
    setLoading(true);
    try {
      const { replies } = await apiGet('/api/quick-replies');
      setReplies(replies || []);
    } catch (error) {
      setMsg(error.message || 'Failed to load replies');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadReplies();
  }, []);

  function handleFormChange(e) {
    const { name, value } = e.target;
    setForm(f => ({ ...f, [name]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setMsg('');
    try {
      if (editing) {
        // Update existing reply
        await apiPatch(`/api/quick-replies/${editing}`, form);
        setMsg('Reply updated successfully');
      } else {
        // Create new reply
        await apiPost('/api/quick-replies', form);
        setMsg('Reply created successfully');
      }
      setForm({ shortcut: '', message: '' });
      setEditing(null);
      loadReplies();
    } catch (error) {
      setMsg(error.message || 'Failed to save reply');
    }
  }

  function startEditing(reply) {
    setEditing(reply._id);
    setForm({ shortcut: reply.shortcut, message: reply.message });
  }

  function cancelEditing() {
    setEditing(null);
    setForm({ shortcut: '', message: '' });
  }

  async function handleDelete(id) {
    if (window.confirm('Are you sure you want to delete this quick reply?')) {
      try {
        await apiDelete(`/api/quick-replies/${id}`);
        setMsg('Reply deleted');
        loadReplies();
      } catch (error) {
        setMsg(error.message || 'Failed to delete reply');
      }
    }
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title gradient heading-green">Quick Replies</div>
          <div className="page-subtitle">Manage your saved chat responses</div>
        </div>
      </div>

      <div className="card" style={{display:'grid', gap:16}}>
        <form onSubmit={handleSubmit}>
          <div style={{fontWeight:700, fontSize:18}}>{editing ? 'Edit' : 'Create'} Quick Reply</div>
          <div style={{display:'grid', gridTemplateColumns:'1fr 2fr', gap:12, alignItems:'start'}}>
            <div>
              <div className="label">Shortcut</div>
              <input
                className="input"
                name="shortcut"
                value={form.shortcut}
                onChange={handleFormChange}
                placeholder="e.g., /greeting"
                required
              />
              <div className="helper">A short, unique key for your reply.</div>
            </div>
            <div>
              <div className="label">Message</div>
              <textarea
                className="input"
                name="message"
                value={form.message}
                onChange={handleFormChange}
                placeholder="Enter your full reply message here..."
                rows={4}
                required
              />
            </div>
          </div>
          <div style={{display:'flex', justifyContent:'flex-end', gap:8, marginTop:12}}>
            {editing && <button type="button" className="btn secondary" onClick={cancelEditing}>Cancel</button>}
            <button className="btn" type="submit">{editing ? 'Save Changes' : 'Create Reply'}</button>
          </div>
          {msg && <div style={{marginTop:8, opacity:0.9}}>{msg}</div>}
        </form>
      </div>

      <div className="card" style={{marginTop:12}}>
        <div style={{fontWeight:700, fontSize:18, marginBottom:12}}>Your Quick Replies</div>
        {loading ? (
          <div>Loading...</div>
        ) : replies.length === 0 ? (
          <div style={{opacity:0.8}}>You haven't created any quick replies yet.</div>
        ) : (
          <div style={{display:'grid', gap:8}}>
            {replies.map(reply => (
              <div key={reply._id} style={{display:'flex', justifyContent:'space-between', alignItems:'center', padding:'10px', background:'var(--panel)', borderRadius:8}}>
                <div>
                  <div style={{fontWeight:700, color:'var(--primary)'}}>{reply.shortcut}</div>
                  <div style={{whiteSpace:'pre-wrap', opacity:0.9}}>{reply.message}</div>
                </div>
                <div style={{display:'flex', gap:8}}>
                  <button className="btn secondary" onClick={() => startEditing(reply)}>Edit</button>
                  <button className="btn danger" onClick={() => handleDelete(reply._id)}>Delete</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
