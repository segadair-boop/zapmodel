import { createFileRoute, Link } from '@tanstack/react-router';
import { MessageCircleMore, UserPlus, ArrowLeft } from 'lucide-react';
import { useState } from 'react';

export const Route = createFileRoute('/signup')({ component: SignupPage });

const API = String((import.meta as any).env?.VITE_API_URL || '').replace(/\/$/, '');

function SignupPage() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(''); setMessage('');
    if (password.length < 8) return setError('A senha deve ter pelo menos 8 caracteres.');
    if (password !== confirm) return setError('As senhas não coincidem.');
    if (!API) return setError('Cadastro disponível quando o backend de produção estiver conectado.');
    setLoading(true);
    try {
      const res = await fetch(`${API}/api/auth/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, email, password }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Não foi possível realizar o cadastro.');
      setMessage('Cadastro realizado com sucesso. Agora você pode entrar no sistema.');
      setName(''); setEmail(''); setPassword(''); setConfirm('');
    } catch (e: any) { setError(e.message); } finally { setLoading(false); }
  }

  return <div className="login-page"><form className="login-card" onSubmit={submit}>
    <div className="login-logo"><UserPlus size={34}/></div>
    <h1>Criar conta</h1><p>Cadastre-se para acessar o ZapModel.</p>
    <label>Nome<input value={name} onChange={e=>setName(e.target.value)} required placeholder="Seu nome"/></label>
    <label>E-mail<input type="email" value={email} onChange={e=>setEmail(e.target.value)} required placeholder="voce@empresa.com"/></label>
    <label>Senha<input type="password" value={password} onChange={e=>setPassword(e.target.value)} required placeholder="Mínimo de 8 caracteres"/></label>
    <label>Confirmar senha<input type="password" value={confirm} onChange={e=>setConfirm(e.target.value)} required placeholder="Repita a senha"/></label>
    {error?<div className="form-error">{error}</div>:null}
    {message?<div className="form-success">{message}</div>:null}
    <button className="primary-btn login-btn" disabled={loading}><UserPlus size={16}/>{loading?'Cadastrando...':'Cadastrar'}</button>
    <Link to="/" className="secondary-btn login-btn"><ArrowLeft size={16}/>Voltar para o login</Link>
  </form></div>;
}
