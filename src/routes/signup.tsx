import { createFileRoute, Link } from '@tanstack/react-router';
import { UserPlus, ArrowLeft } from 'lucide-react';
import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { db } from '@/lib/db';

export const Route = createFileRoute('/signup')({ component: SignupPage });

const OWNER_EMAIL = 'seg.adair@gmail.com';

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
    const normalized = email.trim().toLowerCase();
    setLoading(true);
    try {
      if (normalized === OWNER_EMAIL) {
        const { data: claimed } = await db.rpc('owner_claimed');
        if (claimed) throw new Error('Este e-mail é reservado ao proprietário do sistema e já está em uso.');
      }
      const { error: err } = await supabase.auth.signUp({
        email: normalized,
        password,
        options: { data: { name: name.trim() }, emailRedirectTo: `${window.location.origin}/` },
      });
      if (err) throw new Error(err.message);
      setMessage('Cadastro realizado com sucesso. Agora você pode entrar no sistema.');
      setName(''); setEmail(''); setPassword(''); setConfirm('');
    } catch (e: any) {
      setError(String(e?.message || 'Não foi possível realizar o cadastro.'));
    } finally { setLoading(false); }
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
