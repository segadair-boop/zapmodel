import { createFileRoute } from "@tanstack/react-router";
import {
  Activity, CalendarDays, CheckCircle2, CircleDollarSign, ContactRound, Download, FileText,
  Gauge, Headphones, KanbanSquare, ListTodo, LogOut, Megaphone, Menu,
  MessageCircleMore, MessagesSquare, PlugZap, Plus, RefreshCw, Search, Send,
  Settings, ShieldCheck, Tag, Trash2, Users, Wifi, WifiOff, Zap
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { countRows, db, deleteRow, insertRow, newId, selectAll, updateRow } from "@/lib/db";

export const Route = createFileRoute("/")({ component: ZapModelApp });

type NavKey = "dashboard"|"tickets"|"connections"|"contacts"|"queues"|"quick"|"kanban"|"schedules"|"todo"|"campaigns"|"chat"|"files"|"integrations"|"users"|"finance"|"settings";
type User = { id:string; name:string; email:string; role:string; active:boolean; companyId:string };
type Session = { user:User };

const API = String((import.meta as any).env?.VITE_API_URL || "").replace(/\/$/, "");
const isPreview = !API;

const nav: {key:NavKey;label:string;icon:ReactNode;group?:string}[] = [
  {key:"dashboard",label:"Dashboard",icon:<Gauge size={18}/>},
  {key:"tickets",label:"Atendimentos",icon:<Headphones size={18}/>},
  {key:"connections",label:"Conexões",icon:<PlugZap size={18}/>},
  {key:"contacts",label:"Contatos",icon:<ContactRound size={18}/>,group:"Cadastros"},
  {key:"queues",label:"Filas & Setores",icon:<Users size={18}/>},
  {key:"quick",label:"Respostas rápidas",icon:<Zap size={18}/>},
  {key:"kanban",label:"Kanban",icon:<KanbanSquare size={18}/>,group:"Produtividade"},
  {key:"schedules",label:"Agendamentos",icon:<CalendarDays size={18}/>},
  {key:"todo",label:"Tarefas",icon:<ListTodo size={18}/>},
  {key:"campaigns",label:"Campanhas",icon:<Megaphone size={18}/>,group:"Comunicação"},
  {key:"chat",label:"Chat interno",icon:<MessagesSquare size={18}/>},
  {key:"files",label:"Arquivos",icon:<FileText size={18}/>},
  {key:"integrations",label:"Integrações/API",icon:<Activity size={18}/>,group:"Administração"},
  {key:"users",label:"Usuários",icon:<ShieldCheck size={18}/>},
  {key:"finance",label:"Financeiro",icon:<CircleDollarSign size={18}/>},
  {key:"settings",label:"Configurações",icon:<Settings size={18}/>},
];

async function worker<T>(path:string, opts:RequestInit={}):Promise<T>{
  if(!API) throw new Error("Worker do WhatsApp não configurado.");
  const headers = new Headers(opts.headers||{});
  const { data } = await supabase.auth.getSession();
  if(data.session?.access_token) headers.set("Authorization",`Bearer ${data.session.access_token}`);
  if(!(opts.body instanceof FormData) && opts.body !== undefined) headers.set("Content-Type","application/json");
  let res:Response;
  try { res=await fetch(`${API}${path}`,{...opts,headers}); }
  catch { throw new Error("Não foi possível comunicar com o worker do WhatsApp."); }
  const body=await res.text();
  let json:any=null;
  try{json=body?JSON.parse(body):null}catch{json={error:body||`Erro ${res.status}`}}
  if(!res.ok) throw new Error(json?.error||`Erro ${res.status}`);
  return json as T;
}

function ZapModelApp(){
  const [session,setSession]=useState<Session|null>(null);
  const [ready,setReady]=useState(false);
  const [active,setActive]=useState<NavKey>("dashboard");
  const [menu,setMenu]=useState(false);

  const load=useCallback(async()=>{
    const { data } = await supabase.auth.getSession();
    if(!data.session){ setSession(null); setReady(true); return; }
    const name = (data.session.user.user_metadata as any)?.name || null;
    const { data:profile, error } = await db.rpc("ensure_profile",{ p_name:name });
    if(error||!profile||profile.active===false){
      await supabase.auth.signOut();
      setSession(null);
    } else {
      setSession({ user:{ id:profile.id, name:profile.name, email:profile.email, role:profile.role, active:profile.active, companyId:profile.companyId } });
    }
    setReady(true);
  },[]);

  useEffect(()=>{
    load();
    const { data:sub } = supabase.auth.onAuthStateChange((event)=>{
      if(event==="SIGNED_IN"||event==="SIGNED_OUT"||event==="USER_UPDATED") load();
    });
    return ()=>sub.subscription.unsubscribe();
  },[load]);

  if(!ready) return <div className="login-page"><div className="login-card"><div className="login-logo"><MessageCircleMore size={34}/></div><h1>ZapModel</h1><p>Carregando...</p></div></div>;
  if(!session) return <Login/>;
  return <div className="app-shell">
    <aside className={`sidebar ${menu?"sidebar-open":""}`}>
      <div className="brand"><span className="brand-mark"><MessageCircleMore size={24}/></span><div><b>ZapModel</b><small>Omnichannel</small></div></div>
      <nav className="nav-list">{nav.map((n,i)=><div key={n.key}>{n.group&&nav[i-1]?.group!==n.group?<div className="nav-group">{n.group}</div>:null}<button className={active===n.key?"nav-item active":"nav-item"} onClick={()=>{setActive(n.key);setMenu(false)}}>{n.icon}<span>{n.label}</span></button></div>)}</nav>
      <div className="sidebar-footer"><div className="avatar">{initials(session.user.name)}</div><div><strong>{session.user.name}</strong><small>{session.user.role}</small></div><button title="Sair" onClick={()=>{supabase.auth.signOut();setSession(null)}}><LogOut size={18}/></button></div>
    </aside>
    <div className="main-area"><header className="topbar"><button className="mobile-menu" onClick={()=>setMenu(!menu)}><Menu size={22}/></button><div><h1>{nav.find(n=>n.key===active)?.label}</h1><p>{isPreview?"Worker não configurado":"Lovable Cloud + worker WhatsApp configurados"}</p></div><div className="top-actions"><span className={isPreview?"online-pill preview":"online-pill"}>{isPreview?<WifiOff size={14}/>:<Wifi size={14}/>} {isPreview?"Sem worker":"Produção"}</span><div className="avatar small">{initials(session.user.name)}</div></div></header>
      <main className="content"><Page active={active} session={session}/></main>
    </div>{menu?<button className="sidebar-backdrop" onClick={()=>setMenu(false)}/>:null}
  </div>;
}

function Login(){
  const [email,setEmail]=useState(""); const [password,setPassword]=useState(""); const [error,setError]=useState(""); const [loading,setLoading]=useState(false);
  async function submit(e:React.FormEvent){e.preventDefault();setError("");setLoading(true);try{
    const { error:err } = await supabase.auth.signInWithPassword({ email:email.trim().toLowerCase(), password });
    if(err) throw new Error(err.message==="Invalid login credentials"?"E-mail ou senha inválidos.":err.message);
  }catch(err:any){setError(err.message)}finally{setLoading(false)}}
  return <div className="login-page"><form className="login-card" onSubmit={submit}><div className="login-logo"><MessageCircleMore size={34}/></div><h1>ZapModel</h1><p>Central omnichannel de atendimento.</p><label>E-mail<input type="email" value={email} onChange={e=>setEmail(e.target.value)} required placeholder="voce@empresa.com"/></label><label>Senha<input type="password" value={password} onChange={e=>setPassword(e.target.value)} required placeholder="••••••••"/></label>{error?<div className="form-error">{error}</div>:null}<button className="primary-btn login-btn" disabled={loading}>{loading?"Entrando...":"Entrar"}</button></form></div>
}

function Page({active,session}:{active:NavKey;session:Session}){
  switch(active){
    case "dashboard": return <Dashboard session={session}/>;
    case "tickets": return <Tickets session={session}/>;
    case "connections": return <Connections/>;
    case "contacts": return <Contacts session={session}/>;
    case "queues": return <SimpleCrud session={session} title="Filas & Setores" table="Queue" fields={["name","color"]}/>;
    case "quick": return <SimpleCrud session={session} title="Respostas rápidas" table="QuickMessage" fields={["shortcut","message"]}/>;
    case "kanban": return <Kanban/>;
    case "schedules": return <Schedules session={session}/>;
    case "todo": return <Tasks session={session}/>;
    case "campaigns": return <Campaigns session={session}/>;
    case "files": return <Files/>;
    case "integrations": return <Integrations session={session}/>;
    case "users": return <UsersPage session={session}/>;
    case "settings": return <SettingsPage session={session}/>;
    case "chat": return <Info title="Chat interno" icon={<MessagesSquare/>} text="Módulo reservado para comunicação interna da equipe."/>;
    case "finance": return <Info title="Financeiro" icon={<CircleDollarSign/>} text="Área preparada para planos, faturas e cobrança."/>;
  }
}

function useData<T>(loader:()=>Promise<T>, initial:T, interval=0){
  const [data,setData]=useState<T>(initial);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");
  const reload=useCallback(async()=>{try{setData(await loader());setError("")}catch(e:any){setError(e?.message||String(e))}finally{setLoading(false)}},[]);
  useEffect(()=>{reload();if(!interval)return;const id=setInterval(reload,interval);return()=>clearInterval(id)},[reload,interval]);
  return {data,setData,loading,error,reload};
}

function Dashboard({session}:{session:Session}){
  const {data,error,reload}=useData<any>(async()=>({
    open:await countRows("Ticket",{status:"OPEN"}),pending:await countRows("Ticket",{status:"PENDING"}),closed:await countRows("Ticket",{status:"CLOSED"}),contacts:await countRows("Contact"),messages:await countRows("Message"),connectedSessions:await countRows("WhatsAppSession",{status:"CONNECTED"}),campaigns:await countRows("Campaign")
  }),{open:0,pending:0,closed:0,contacts:0,messages:0,connectedSessions:0,campaigns:0},7000);
  return <div className="stack"><div className="hero"><div><span className="eyebrow"><Activity size={15}/> Operação em tempo real</span><h2>Olá, {session.user.name}!</h2><p>Acompanhe os principais indicadores da central.</p></div><button className="secondary-btn" onClick={reload}><RefreshCw size={16}/>Atualizar</button></div>{error?<Alert text={error}/>:null}<div className="stat-grid"><Stat label="Abertos" value={data.open} icon={<Headphones/>}/><Stat label="Aguardando" value={data.pending} icon={<Activity/>}/><Stat label="Finalizados" value={data.closed} icon={<CheckCircle2/>}/><Stat label="Contatos" value={data.contacts} icon={<ContactRound/>}/><Stat label="Mensagens" value={data.messages} icon={<MessagesSquare/>}/><Stat label="WhatsApp conectado" value={data.connectedSessions} icon={<Wifi/>}/></div></div>
}

const TICKET_SELECT = "*, contact:Contact(name,number,whatsappJid), queue:Queue(name), session:WhatsAppSession(name,status)";

function Tickets({session}:{session:Session}){
  const r=useData<any[]>(()=>selectAll("Ticket",TICKET_SELECT,"updatedAt"),[],3500);
  const [selected,setSelected]=useState(""); const [messages,setMessages]=useState<any[]>([]); const [text,setText]=useState(""); const [q,setQ]=useState("");
  const ticket=r.data.find(t=>t.id===(selected||r.data[0]?.id));
  const visible=useMemo(()=>r.data.filter(t=>`${t.contact?.name||""} ${t.contact?.number||""} ${t.lastMessage||""}`.toLowerCase().includes(q.toLowerCase())),[r.data,q]);
  const loadMessages=useCallback(async()=>{
    if(!ticket){setMessages([]);return}
    try{
      if(API) setMessages(await worker<any[]>(`/api/tickets/${ticket.id}/messages`));
      else {const {data,error}=await db.from("Message").select("*").eq("ticketId",ticket.id).order("createdAt",{ascending:true});if(error)throw error;setMessages(data||[])}
    }catch(e:any){console.error(e)}
  },[ticket?.id]);
  useEffect(()=>{loadMessages();if(!ticket)return;const id=setInterval(()=>{loadMessages();r.reload()},2500);return()=>clearInterval(id)},[loadMessages,ticket?.id]);
  async function send(){if(!ticket||!text.trim())return;try{
    if(!API) throw new Error("O worker do WhatsApp está indisponível. A mensagem não foi enviada.");
    const body=text.trim(); setText("");
    const m=await worker<any>(`/api/tickets/${ticket.id}/messages`,{method:"POST",body:JSON.stringify({body})});
    setMessages(v=>v.some(x=>x.id===m.id)?v:[...v,m]); r.reload();
  }catch(e:any){alert(e.message)}}
  async function status(status:string){if(!ticket)return;try{await updateRow("Ticket",ticket.id,{status});r.reload()}catch(e:any){alert(e.message)}}
  async function newTicket(){try{
    const contacts=await selectAll("Contact"); if(!contacts.length) throw new Error("Cadastre um contato antes de iniciar um atendimento.");
    const query=prompt("Digite o nome ou número do contato:"); if(!query)return;
    const digits=query.replace(/\D/g,""); const contact=contacts.find(c=>c.id===query||c.number===digits||String(c.name).toLowerCase().includes(query.toLowerCase()));
    if(!contact) throw new Error("Contato não encontrado.");
    const sessions=(await selectAll("WhatsAppSession")).filter(s=>s.status==="CONNECTED"); if(!sessions.length) throw new Error("Nenhuma conexão de WhatsApp está conectada.");
    const existing=r.data.find(t=>t.contactId===contact.id&&t.sessionId===sessions[0].id&&t.status!=="CLOSED");
    if(existing){setSelected(existing.id);return}
    const created=await insertRow("Ticket",{status:"OPEN",unread:0,contactId:contact.id,sessionId:sessions[0].id,companyId:session.user.companyId}); setSelected(created.id);r.reload();
  }catch(e:any){alert(e.message)}}
  return <div className="ticket-layout"><section className="panel ticket-list"><div className="toolbar"><div className="search-box"><Search size={16}/><input value={q} onChange={e=>setQ(e.target.value)} placeholder="Buscar atendimento"/></div><button className="icon-btn" onClick={r.reload}><RefreshCw size={16}/></button><button className="icon-btn" title="Novo atendimento" onClick={newTicket}><Plus size={16}/></button></div>{visible.map(t=><button key={t.id} className={`ticket-card ${ticket?.id===t.id?"selected":""}`} onClick={()=>setSelected(t.id)}><div className="avatar">{initials(t.contact?.name||"C")}</div><div><strong>{t.contact?.name}</strong><small>{t.queue?.name||"Sem fila"}</small><p>{t.lastMessage||"Sem mensagens"}</p></div>{t.unread?<em>{t.unread}</em>:null}</button>)}</section><section className="panel conversation">{ticket?<><div className="conversation-head"><div><strong>{ticket.contact?.name}</strong><small>{formatPhone(ticket.contact?.number)} • {ticket.session?.name||"Sem conexão"}</small></div><div className="row-actions"><button onClick={()=>status("PENDING")}>Aguardar</button><button onClick={()=>status("CLOSED")}>Finalizar</button></div></div><div className="messages">{messages.map(m=><div key={m.id} className={m.fromMe?"bubble mine":"bubble"}><p>{m.body||"Arquivo"}</p><small>{new Date(m.createdAt).toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"})}</small></div>)}</div><div className="composer"><input value={text} onChange={e=>setText(e.target.value)} onKeyDown={e=>{if(e.key==="Enter")send()}} placeholder="Digite uma mensagem..."/><button className="primary-btn" onClick={send}><Send size={17}/></button></div></>:<Empty text="Nenhum atendimento"/>}</section></div>
}

function Connections(){
  const r=useData<any[]>(()=>selectAll("WhatsAppSession"),[],3000);
  async function add(){const name=prompt("Nome da conexão:","Principal");if(!name)return;if(!API)return alert("Worker do WhatsApp indisponível.");try{await worker("/api/whatsapp",{method:"POST",body:JSON.stringify({name})});r.reload()}catch(e:any){alert(e.message)}}
  async function action(id:string,kind:"connect"|"disconnect"){if(!API)return alert("Worker do WhatsApp indisponível.");try{await worker(`/api/whatsapp/${id}/${kind}`,{method:"POST",body:JSON.stringify(kind==="disconnect"?{logout:false}:{})});r.reload()}catch(e:any){alert(e.message)}}
  return <div className="stack"><div className="page-actions"><p>Gerencie sessões persistentes do WhatsApp.</p><button className="primary-btn" onClick={add}><Plus size={16}/>Nova conexão</button></div>{r.error?<Alert text={r.error}/>:null}<div className="cards-grid">{r.data.map(w=><div className="panel connection-card" key={w.id}><div className="connection-icon"><MessageCircleMore/></div><h3>{w.name}</h3><p>{w.phone?formatPhone(w.phone):"Aguardando leitura do QR Code"}</p><span className={`status ${String(w.status).toLowerCase()}`}>{w.status}</span>{w.qr?<img className="qr-real" src={w.qr} alt="QR Code WhatsApp"/>:null}<div className="row-actions"><button onClick={()=>action(w.id,"connect")}>Conectar</button><button onClick={()=>action(w.id,"disconnect")}>Desconectar</button></div></div>)}</div></div>
}

function Contacts({session}:{session:Session}){
  const r=useData<any[]>(()=>selectAll("Contact"),[],5000); const [q,setQ]=useState("");
  const rows=useMemo(()=>r.data.filter(c=>`${c.name} ${c.number} ${c.email||""}`.toLowerCase().includes(q.toLowerCase())),[r.data,q]);
  async function add(){const name=prompt("Nome do contato:");if(!name)return;const raw=prompt("Número com DDI e DDD:");if(!raw)return;const number=raw.replace(/\D/g,"");if(number.length<10) return alert("Informe um número válido com DDD e, de preferência, DDI.");const email=prompt("E-mail (opcional):")||"";try{if(r.data.some(c=>String(c.number).replace(/\D/g,"")===number))throw new Error("Este número já está cadastrado.");await insertRow("Contact",{name:name.trim(),number,email:email.trim()||null,companyId:session.user.companyId});r.reload()}catch(e:any){alert(e.message)}}
  async function del(id:string){if(!confirm("Excluir este contato?"))return;try{const linked=await db.from("Ticket").select("id",{count:"exact",head:true}).eq("contactId",id);if((linked.count||0)>0)throw new Error("Este contato possui atendimentos vinculados e não pode ser excluído.");await deleteRow("Contact",id);r.reload()}catch(e:any){alert(e.message)}}
  return <div className="stack"><div className="page-actions"><div className="search-box wide"><Search size={16}/><input value={q} onChange={e=>setQ(e.target.value)} placeholder="Buscar contato"/></div><button className="primary-btn" onClick={add}><Plus size={16}/>Novo contato</button></div><section className="panel"><Table heads={["Nome","Número","E-mail",""]} rows={rows.map(c=>[<AvatarName name={c.name}/>,formatPhone(c.number),c.email||"—",<button className="danger-icon" onClick={()=>del(c.id)}><Trash2 size={16}/></button>])}/></section></div>
}

function SimpleCrud({session,title,table,fields}:{session:Session;title:string;table:string;fields:string[]}){
  const r=useData<any[]>(()=>selectAll(table),[],5000);
  async function add(){const body:any={};for(const f of fields){const v=prompt(`${label(f)}:`);if(v===null)return;body[f]=v.trim()}try{await insertRow(table,{...body,companyId:session.user.companyId});r.reload()}catch(e:any){alert(e.message)}}
  async function del(id:string){try{await deleteRow(table,id);r.reload()}catch(e:any){alert(e.message)}}
  return <div className="stack"><div className="page-actions"><p>Cadastros de {title.toLowerCase()}.</p><button className="primary-btn" onClick={add}><Plus size={16}/>Novo</button></div>{r.error?<Alert text={r.error}/>:null}<section className="panel"><Table heads={[...fields.map(label),""]} rows={r.data.map(row=>[...fields.map(f=>row[f]||"—"),<button className="danger-icon" onClick={()=>del(row.id)}><Trash2 size={16}/></button>])}/></section></div>
}

const KANBAN_COLUMNS=[{s:"OPEN",t:"Em atendimento"},{s:"PENDING",t:"Aguardando"},{s:"CLOSED",t:"Finalizados"}];
function Kanban(){
  const r=useData<any[]>(()=>selectAll("Ticket",TICKET_SELECT,"updatedAt"),[],4000); const [moved,setMoved]=useState<Record<string,string>>({}); const [dragId,setDragId]=useState(""); const [overCol,setOverCol]=useState("");
  const statusOf=(t:any)=>moved[t.id]||t.status;
  async function move(id:string,status:string){const current=r.data.find(t=>t.id===id);if(!current||statusOf(current)===status)return;setMoved(v=>({...v,[id]:status}));try{await updateRow("Ticket",id,{status});await r.reload();setMoved(v=>{const n={...v};delete n[id];return n})}catch(e:any){setMoved(v=>{const n={...v};delete n[id];return n});r.reload();alert(e.message||"Não foi possível mover o card.")}}
  return <div className="kanban-board">{KANBAN_COLUMNS.map(c=>{const cards=r.data.filter(t=>statusOf(t)===c.s);return <section className="kanban-col" key={c.s} style={overCol===c.s?{outline:"2px dashed var(--green)",outlineOffset:"-4px",background:"#dfeae5"}:undefined} onDragOver={e=>{e.preventDefault();setOverCol(c.s)}} onDragLeave={()=>setOverCol(o=>o===c.s?"":o)} onDrop={e=>{e.preventDefault();setOverCol("");const id=dragId||e.dataTransfer.getData("text/plain");if(id)move(id,c.s);setDragId("")}}><h3>{c.t}<span>{cards.length}</span></h3>{cards.map(t=><div className="kanban-card" key={t.id} draggable style={{cursor:dragId===t.id?"grabbing":"grab",opacity:dragId===t.id?.5:1}} onDragStart={e=>{setDragId(t.id);e.dataTransfer.effectAllowed="move";e.dataTransfer.setData("text/plain",t.id)}} onDragEnd={()=>{setDragId("");setOverCol("")}}><strong>{t.contact?.name}</strong><p>{t.lastMessage||"Sem mensagens"}</p><small>{t.queue?.name||"Sem fila"}</small><div className="row-actions">{KANBAN_COLUMNS.filter(o=>o.s!==c.s).map(o=><button key={o.s} onClick={()=>move(t.id,o.s)}>{o.t}</button>)}</div></div>)}</section>})}</div>
}

function Schedules({session}:{session:Session}){
  const r=useData<any[]>(()=>selectAll("Schedule","*","scheduledAt"),[],5000);
  async function add(){const title=prompt("Título:");if(!title)return;const body=prompt("Mensagem:");if(!body?.trim())return alert("Informe a mensagem do agendamento.");const raw=prompt("Número do contato com DDI e DDD:");if(!raw)return;const contactNumber=raw.replace(/\D/g,"");if(contactNumber.length<10)return alert("Número inválido.");const scheduledAt=prompt("Data/hora (AAAA-MM-DDTHH:mm):",new Date(Date.now()+3600000).toISOString().slice(0,16));if(!scheduledAt)return;try{await insertRow("Schedule",{title:title.trim(),body:body.trim(),contactNumber,scheduledAt:new Date(scheduledAt).toISOString(),userId:session.user.id,companyId:session.user.companyId});r.reload()}catch(e:any){alert(e.message)}}
  return <ListPanel title="Agendamentos" action={add} heads={["Título","Destino","Agendado para","Status"]} rows={r.data.map(x=>[x.title,formatPhone(x.contactNumber||""),fmt(x.scheduledAt),x.sentAt?`Enviado em ${fmt(x.sentAt)}`:new Date(x.scheduledAt)<new Date()?"Aguardando conexão/envio":"Agendado"])} />
}

function Tasks({session}:{session:Session}){
  const r=useData<any[]>(()=>selectAll("Task"),[],5000);
  async function add(){const title=prompt("Título da tarefa:");if(!title)return;try{await insertRow("Task",{title,status:"TODO",userId:session.user.id,companyId:session.user.companyId});r.reload()}catch(e:any){alert(e.message)}}
  async function advance(x:any){const next=x.status==="TODO"?"DOING":x.status==="DOING"?"DONE":"TODO";try{await updateRow("Task",x.id,{status:next});r.reload()}catch(e:any){alert(e.message)}}
  return <div className="stack"><div className="page-actions"><p>Organize atividades da equipe.</p><button className="primary-btn" onClick={add}><Plus size={16}/>Nova tarefa</button></div><div className="cards-grid">{r.data.map(x=><div className="panel task-card" key={x.id}><Tag size={18}/><h3>{x.title}</h3><p>{x.description||"Sem descrição"}</p><button onClick={()=>advance(x)}>{x.status}</button></div>)}</div></div>
}

function Campaigns({session}:{session:Session}){
  const r=useData<any[]>(()=>selectAll("Campaign","*, CampaignContact(count)"),[],6000);
  async function add(){const name=prompt("Nome da campanha:");if(!name)return;const message=prompt("Mensagem (use {{nome}} para personalizar):");if(!message?.trim())return;try{const contacts=await selectAll("Contact");if(!contacts.length)throw new Error("Cadastre contatos antes de criar uma campanha.");const answer=prompt("Destinatários: digite TODOS para usar todos os contatos ou informe números separados por vírgula:","TODOS");if(!answer)return;let chosen=contacts;if(answer.trim().toUpperCase()!=="TODOS"){const wanted=answer.split(",").map(v=>v.replace(/\D/g,"")).filter(Boolean);chosen=contacts.filter(c=>wanted.includes(String(c.number).replace(/\D/g,"")))}if(!chosen.length)throw new Error("Nenhum destinatário válido foi selecionado.");const campaign=await insertRow("Campaign",{name:name.trim(),message:message.trim(),status:"DRAFT",companyId:session.user.companyId});const {error}=await db.from("CampaignContact").insert(chosen.map(c=>({campaignId:campaign.id,contactId:c.id,status:"PENDING"})));if(error){await deleteRow("Campaign",campaign.id).catch(()=>undefined);throw error}r.reload()}catch(e:any){alert(e.message)}}
  async function start(id:string){try{if(!API)throw new Error("Worker do WhatsApp indisponível. A campanha não foi iniciada.");const result=await worker<any>(`/api/campaigns/${id}/start`,{method:"POST"});alert(`Campanha iniciada para ${result.total} destinatário(s).`);r.reload()}catch(e:any){alert(e.message)}}
  return <div className="stack"><div className="page-actions"><p>Crie e acompanhe disparos para contatos autorizados.</p><button className="primary-btn" onClick={add}><Plus size={16}/>Nova campanha</button></div><section className="panel"><Table heads={["Campanha","Status","Destinatários",""]} rows={r.data.map(x=>[x.name,x.status,x.CampaignContact?.[0]?.count??0,<button disabled={x.status==="RUNNING"} onClick={()=>start(x.id)}>Iniciar</button>])}/></section></div>
}

function Files(){
  const r=useData<any[]>(()=>selectAll("FileAsset"),[],6000);
  async function uploadFile(e:React.ChangeEvent<HTMLInputElement>){const file=e.target.files?.[0];if(!file)return;if(!API)return alert("O worker do WhatsApp está indisponível.");const form=new FormData();form.append("file",file);try{const row=await worker<any>("/api/files",{method:"POST",body:form});r.setData(v=>[row,...v])}catch(err:any){alert(err.message)}finally{e.target.value=""}}
  async function downloadFile(x:any){try{const {data}=await supabase.auth.getSession();const res=await fetch(`${API}/api/files/${x.id}/download`,{headers:{Authorization:`Bearer ${data.session?.access_token||""}`}});if(!res.ok){let msg="Não foi possível baixar o arquivo.";try{const j=await res.json();msg=j.error||msg}catch{}throw new Error(msg)}const blob=await res.blob();const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download=x.name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}catch(e:any){alert(e.message)}}
  return <div className="stack"><div className="page-actions"><p>Biblioteca protegida de arquivos.</p><label className="primary-btn file-button"><Plus size={16}/>Enviar arquivo<input type="file" hidden onChange={uploadFile}/></label></div><section className="panel"><Table heads={["Arquivo","Tipo","Tamanho","Data",""]} rows={r.data.map(x=>[x.name,x.mimeType||"—",x.size?`${Math.round(x.size/1024)} KB`:"—",x.createdAt?fmt(x.createdAt):"—",<button className="icon-btn" title="Baixar" onClick={()=>downloadFile(x)}><Download size={15}/></button>])}/></section></div>
}

async function sha256(value:string){const buf=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value));return Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,"0")).join("")}
function Integrations({session}:{session:Session}){
  const r=useData<any[]>(()=>selectAll("ApiToken"),[]); const [newToken,setNewToken]=useState("");
  async function add(){const name=prompt("Nome do token:","Integração");if(!name)return;try{const token=`zm_${newId().replace(/-/g,"")}${newId().replace(/-/g,"")}`;await insertRow("ApiToken",{name,tokenHash:await sha256(token),active:true,companyId:session.user.companyId});setNewToken(token);r.reload()}catch(e:any){alert(e.message)}}
  return <div className="stack"><div className="hero"><div><h2>API externa</h2><p>Envie mensagens por integração usando uma chave de API.</p></div><button className="primary-btn" onClick={add}><Plus size={16}/>Gerar token</button></div>{newToken?<div className="panel token-box"><strong>Copie agora — o token completo é exibido somente neste momento:</strong><code>{newToken}</code></div>:null}<section className="panel"><Table heads={["Nome","Ativo","Criado em"]} rows={r.data.map(x=>[x.name,x.active?"Sim":"Não",fmt(x.createdAt)])}/></section><section className="panel api-help"><h3>Envio por API</h3><code>POST {API||"https://api.seudominio.com"}/api/v1/messages/send</code><p>Header: <b>X-API-Key</b> ou <b>Authorization: Bearer TOKEN</b> • Body JSON: <b>number</b> e <b>message</b> (ou <b>body</b>).</p></section></div>
}

function UsersPage({session}:{session:Session}){
  const r=useData<any[]>(()=>selectAll("User"),[],5000);
  async function toggleActive(x:any){try{const {error}=await db.rpc("set_user_active",{p_user_id:x.id,p_active:!x.active});if(error)throw error;r.reload()}catch(e:any){alert(e.message)}}
  async function toggleRole(x:any){if(session.user.role!=="OWNER")return;const next=x.role==="ADMIN"?"AGENT":"ADMIN";try{const {error}=await db.rpc("set_user_role",{p_user_id:x.id,p_role:next});if(error)throw error;r.reload()}catch(e:any){alert(e.message)}}
  const action=()=>alert("Por segurança, o cadastro público está fechado. O proprietário controla os usuários existentes nesta tela.");
  return <ListPanel title="Usuários" action={action} heads={["Nome","E-mail","Perfil","Ativo","Ações"]} rows={r.data.map(x=>[x.name,x.email,x.role,x.active?"Sim":"Não",x.role==="OWNER"?"Proprietário":<span className="row-actions"><button onClick={()=>toggleRole(x)}>{x.role==="ADMIN"?"Tornar agente":"Tornar admin"}</button><button onClick={()=>toggleActive(x)}>{x.active?"Desativar":"Ativar"}</button></span>])}/>
}

function SettingsPage({session}:{session:Session}){
  const r=useData<any[]>(()=>selectAll("Setting","*","updatedAt"),[]); const [key,setKey]=useState(""); const [value,setValue]=useState("");
  async function save(){if(!key.trim()||!value.trim())return alert("Informe a chave e o valor.");try{const existing=r.data.find(x=>x.key===key.trim());if(existing)await updateRow("Setting",existing.id,{value:value.trim()});else await insertRow("Setting",{key:key.trim(),value:value.trim(),companyId:session.user.companyId});setKey("");setValue("");r.reload()}catch(e:any){alert(e.message)}}
  return <div className="stack"><section className="panel settings-form"><h3>Configuração</h3><div className="inline-form"><input value={key} onChange={e=>setKey(e.target.value)} placeholder="Chave"/><input value={value} onChange={e=>setValue(e.target.value)} placeholder="Valor"/><button className="primary-btn" onClick={save}>Salvar</button></div></section><section className="panel"><Table heads={["Chave","Valor"]} rows={r.data.map(x=>[x.key,x.value])}/></section></div>
}

function ListPanel({title,action,heads,rows}:{title:string;action:()=>void;heads:string[];rows:ReactNode[][]}){return <div className="stack"><div className="page-actions"><p>{title}</p><button className="primary-btn" onClick={action}><Plus size={16}/>Novo</button></div><section className="panel"><Table heads={heads} rows={rows}/></section></div>}
function Table({heads,rows}:{heads:string[];rows:ReactNode[][]}){return <div className="data-table"><div className="data-row data-head">{heads.map((h,i)=><span key={i}>{h}</span>)}</div>{rows.map((r,i)=><div className="data-row" key={i}>{r.map((c,j)=><span key={j}>{c}</span>)}</div>)}{!rows.length?<Empty text="Nenhum registro"/>:null}</div>}
function Stat({label,value,icon}:{label:string;value:any;icon:ReactNode}){return <div className="stat-card"><div className="stat-icon">{icon}</div><div><small>{label}</small><strong>{value??0}</strong></div></div>}
function AvatarName({name}:{name:string}){return <span className="avatar-name"><i className="avatar small">{initials(name)}</i><b>{name}</b></span>}
function Alert({text}:{text:string}){return <div className="form-error">{text}</div>}
function Empty({text}:{text:string}){return <div className="empty-state">{text}</div>}
function Info({title,icon,text}:{title:string;icon:ReactNode;text:string}){return <div className="panel info-card"><div className="connection-icon">{icon}</div><h2>{title}</h2><p>{text}</p></div>}
function initials(name:string){return name.split(/\s+/).filter(Boolean).slice(0,2).map(x=>x[0]).join("").toUpperCase()||"ZM"}
function fmt(v:string){try{return new Date(v).toLocaleString("pt-BR")}catch{return v}}
function formatPhone(v:string){const d=String(v||"").replace(/\D/g,"");if(!d)return "—";if(d.startsWith("55")&&d.length>=12){const ddd=d.slice(2,4);const n=d.slice(4);return `+55 (${ddd}) ${n.length===9?n.slice(0,5)+"-"+n.slice(5):n.slice(0,4)+"-"+n.slice(4)}`}return `+${d}`}
function label(v:string){return ({name:"Nome",color:"Cor",shortcut:"Atalho",message:"Mensagem"} as any)[v]||v}
