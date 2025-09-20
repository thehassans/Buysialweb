import React, { useEffect, useMemo, useState } from 'react'
import { apiGet, apiPost } from '../../api.js'
import Modal from '../../components/Modal.jsx'
import PasswordInput from '../../components/PasswordInput.jsx'
import PhoneInput from 'react-phone-number-input'
import { getCountries, getCountryCallingCode } from 'libphonenumber-js'
import 'react-phone-number-input/style.css'

export default function AdminUsers(){
  const [users, setUsers] = useState([])
  const [open, setOpen] = useState(false)

  async function load(){
    const { users } = await apiGet('/api/users')
    setUsers(users)
  }
  useEffect(()=>{ load() }, [])

  function CreateUserForm({ onCreated }){
    const [firstName,setFirstName]=useState('')
    const [lastName,setLastName]=useState('')
    const [email,setEmail]=useState('')
    const [phone,setPhone]=useState('')
    // ISO 3166-1 alpha-2 country code, ex: 'US', 'PK'
    const [country,setCountry]=useState('')
    const [password,setPassword]=useState('')
    const [role,setRole]=useState('user')
    const [loading,setLoading]=useState(false)

    // Build a list of countries like: "US (+1)"
    const countryOptions = useMemo(()=>{
      try{
        return getCountries().map(c => ({
          code: c,
          label: `${c} (+${getCountryCallingCode(c)})`,
        }))
      }catch{
        return []
      }
    }, [])

    async function submit(){
      setLoading(true)
      try{
        await apiPost('/api/users', { firstName,lastName,email,phone,country,password,role })
        onCreated()
      }catch(e){
        alert('Failed: '+(e?.message||'error'))
      }finally{ setLoading(false) }
    }

    return (
      <div>
        <div className="label">First Name</div>
        <input className="input" value={firstName} onChange={e=>setFirstName(e.target.value)} placeholder="First Name" />
        <div className="label">Last Name</div>
        <input className="input" value={lastName} onChange={e=>setLastName(e.target.value)} placeholder="Last Name" />
        <div className="label">Email</div>
        <input className="input" value={email} onChange={e=>setEmail(e.target.value)} placeholder="Email" />
        <div className="label">Country</div>
        <select
          className="input"
          value={country}
          onChange={e=>setCountry(e.target.value)}
        >
          <option value="">Select Country</option>
          {countryOptions.map(opt => (
            <option key={opt.code} value={opt.code}>{opt.label}</option>
          ))}
        </select>
        <div className="label">Phone</div>
        <div className="input-group">
          <PhoneInput
            international
            country={country || undefined}
            defaultCountry={country || undefined}
            value={phone}
            onChange={setPhone}
            placeholder="Enter phone number"
            className="input"
          />
        </div>
        <div className="label">Password</div>
        <PasswordInput value={password} onChange={setPassword} />
        <div className="label">Role</div>
        <select className="input" value={role} onChange={e=>setRole(e.target.value)}>
          <option value="user">User</option>
          <option value="agent">Agent</option>
          <option value="admin">Admin</option>
        </select>
        <div style={{display:'flex',justifyContent:'flex-end',gap:8,marginTop:12}}>
          <button className="btn secondary" onClick={()=>setOpen(false)}>Cancel</button>
          <button className="btn" onClick={submit} disabled={loading}>{loading?'Creating...':'Create Now'}</button>
        </div>
      </div>
    )
  }

  return (
    <div>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}>
        <h2>Users</h2>
        <button className="btn" onClick={()=>setOpen(true)}>Create User</button>
      </div>
      <div className="card">
        <table style={{width:'100%', borderCollapse:'collapse'}}>
          <thead>
            <tr style={{textAlign:'left'}}>
              <th>Name</th>
              <th>Email</th>
              <th>Role</th>
              <th>Created</th>
            </tr>
          </thead>
          <tbody>
            {users.map(u=> (
              <tr key={u._id}>
                <td>{u.firstName} {u.lastName}</td>
                <td>{u.email}</td>
                <td>{u.role}</td>
                <td>{new Date(u.createdAt).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal title="Create User" open={open} onClose={()=>setOpen(false)}>
        <CreateUserForm onCreated={()=>{ setOpen(false); load(); }} />
      </Modal>
    </div>
  )
}
