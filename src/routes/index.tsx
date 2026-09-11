import { createFileRoute } from "@tanstack/react-router";
import {
  Activity, CalendarDays, CheckCircle2, CircleDollarSign, ContactRound, FileText,
  Gauge, Headphones, KanbanSquare, ListTodo, LogOut, Megaphone, Menu,
  MessageCircleMore, MessagesSquare, PlugZap, Plus, RefreshCw, Search, Send,
  Settings, ShieldCheck, Tag, Trash2, Users, Wifi, WifiOff, Zap
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";

export const Route = createFileRoute("/")({ component: ZapModelApp });

type NavKey = "dashboard"|"tickets"|"connections"|"contacts"|"queues"|"quick"|"kanban"|"schedules"|"todo"|"campaigns"|"chat"|"files"|"integrations"|"users"|"finance"|"settings";
type User = { id:string; name:string; email:string; role:string; companyId:string };
type Session = { token:string; user:User };

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

const demo = {
  dashboard:{open:2,pending:1,closed:38,contacts:1246,messages:3412,connectedSessions:1,campaigns:4},
  contacts:[{id:"c1",name:"Maria Oliveira",number:"5538991112233",email:"maria@exemplo.com"},{id:"c2",name:"João Martins",number:"5538998765412",email:"joao@exemplo.com"}],
  queues:[{id:"q1",name:"Comercial",color:"#22c55e"},{id:"q2",name:"Suporte",color:"#3b82f6"},{id:"q3",name:"Financeiro",color:"#f59e0b"}],
  tickets:[
    {id:"t1",status:"OPEN",lastMessage:"Gostaria de conhecer os planos",unread:2,contact:{name:"Maria Oliveira",number:"5538991112233"},queue:{name:"Comercial"},session:{name:"Principal",status:"CONNECTED"}},
    {id:"t2",status:"PENDING",lastMessage:"Vou reiniciar e testar",unread:0,contact:{name:"João Martins",number:"5538998765412"},queue:{name:"Suporte"},session:{name:"Principal",status:"CONNECTED"}}
  ],
  whatsapp:[{id:"w1",name:"Principal",phone:"5538999999999",status:"CONNECTED",qr:null,isDefault:true}],
  quick:[{id:"r1",shortcut:"/ola",message:"Olá! Como posso ajudar?"}],
  tags:[{id:"g1",name:"Cliente",color:"#22c55e"}],
  schedules:[{id:"s1",title:"Retorno comercial",body:"Olá, podemos continuar?",scheduledAt:new Date(Date.now()+3600000).toISOString(),sentAt:null}],
  tasks:[{id:"d1",title:"Revisar fila de suporte",description:"Validar chamados pendentes",status:"TODO"}],
  campaigns:[{id:"p1",name:"Campanha de boas-vindas",message:"Olá!",status:"DRAFT",_count:{contacts:12}}],
  users:[{id:"u1",name:"Administrador",email:"admin@zapmodel.local",role:"OWNER",active:true}],
  files:[],
  settings:[]
};

function useStored<T>(key:string, fallback:T){
  const [v,setV]=useState<T>(fallback);
  useEffect(()=>{try{const raw=localStorage.getItem(key);if(raw)setV(JSON.parse(raw));}catch{}},[key]);
  useEffect(()=>{try{localStorage.setItem(key,JSON.stringify(v));}catch{}},[key,v]);
  return [v,setV] as const;
}

async function request<T>(path:string, opts:RequestInit={}, token?:string):Promise<T>{
  if(!API) throw new Error("API não configurada");
  const headers = new Headers(opts.headers||{});
  if(token) headers.set("Authorization",`Bearer ${token}`);
  if(!(opts.body instanceof FormData)) headers.set("Content-Type","application/json");
  const res=await fetch(`${API}${path}`,{...opts,headers});
  const body=await res.text();
  const data=body?JSON.parse(body):null;
  if(!res.ok) throw new Error(data?.error||`Erro ${res.status}`);
  return data as T;
}

function ZapModelApp(){
  const [session,setSession]=useStored<Session|null>("zapmodel-session",null);
  const [active,setActive]=useState<NavKey>("dashboard");
  const [menu,setMenu]=useState(false);
  if(!session) return <Login onSuccess={setSession}/>;
  return <div className="app-shell">
    <aside className={`sidebar ${menu?"sidebar-open":""}`}>
      <div className="brand"><span className="brand-mark"><MessageCircleMore size={24}/></span><div><b>ZapModel</b><small>Omnichannel</small></div></div>
      <nav className="nav-list">{nav.map((n,i)=><div key={n.key}>{n.group&&nav[i-1]?.group!==n.group?<div className="nav-group">{n.group}</div>:null}<button className={active===n.key?"nav-item active":"nav-item"} onClick={()=>{setActive(n.key);setMenu(false)}}>{n.icon}<span>{n.label}</span></button></div>)}</nav>
      <div className="sidebar-footer"><div className="avatar">{initials(session.user.name)}</div><div><strong>{session.user.name}</strong><small>{session.user.role}</small></div><button title="Sair" onClick={()=>setSession(null)}><LogOut size={18}/></button></div>
    </aside>
    <div className="main-area"><header className="topbar"><button className="mobile-menu" onClick={()=>setMenu(!menu)}><Menu size={22}/></button><div><h1>{nav.find(n=>n.key===active)?.label}</h1><p>{isPreview?"Modo de visualização — conecte VITE_API_URL para dados reais":"Backend conectado — dados persistentes"}</p></div><div className="top-actions"><span className={isPreview?"online-pill preview":"online-pill"}>{isPreview?<WifiOff size={14}/>:<Wifi size={14}/>} {isPreview?"Preview":"Produção"}</span><div className="avatar small">{initials(session.user.name)}</div></div></header>
      <main className="content"><Page active={active} session={session}/></main>
    </div>{menu?<button className="sidebar-backdrop" onClick={()=>setMenu(false)}/>:null}
  </div>;
}

function Login({onSuccess}:{onSuccess:(s:Session)=>void}){
  const [email,setEmail]=useState(""); const [password,setPassword]=useState(""); const [error,setError]=useState(""); const [loading,setLoading]=useState(false);
  async function submit(e:React.FormEvent){e.preventDefault();setError("");setLoading(true);try{
    if(isPreview){onSuccess({token:"preview",user:{id:"preview",name:"Administrador",email:email||"preview@zapmodel.local",role:"OWNER",companyId:"preview"}});return;}
    const data=await request<Session>("/api/auth/login",{method:"POST",body:JSON.stringify({email,password})});onSuccess(data);
  }catch(err:any){setError(err.message)}finally{setLoading(false)}}
  return <div className="login-page"><form className="login-card" onSubmit={submit}><div className="login-logo"><MessageCircleMore size={34}/></div><h1>ZapModel</h1><p>Central omnichannel de atendimento.</p><label>E-mail<input type="email" value={email} onChange={e=>setEmail(e.target.value)} required placeholder="voce@empresa.com"/></label><label>Senha<input type="password" value={password} onChange={e=>setPassword(e.target.value)} required placeholder="••••••••"/></label>{error?<div className="form-error">{error}</div>:null}<button className="primary-btn login-btn" disabled={loading}>{loading?"Entrando...":"Entrar"}</button>{isPreview?<small className="login-note">Preview do Lovable: qualquer e-mail e senha permitem visualizar. Em produção, a autenticação é feita pelo backend.</small>:null}</form></div>
}

function Page({active,session}:{active:NavKey;session:Session}){
  switch(active){
    case "dashboard": return <Dashboard session={session}/>;
    case "tickets": return <Tickets session={session}/>;
    case "connections": return <Connections session={session}/>;
    case "contacts": return <Contacts session={session}/>;
    case "queues": return <SimpleCrud session={session} title="Filas & Setores" endpoint="/api/queues" demoRows={demo.queues} fields={["name","color"]}/>;
    case "quick": return <SimpleCrud session={session} title="Respostas rápidas" endpoint="/api/quick-messages" demoRows={demo.quick} fields={["shortcut","message"]}/>;
    case "kanban": return <Kanban session={session}/>;
    case "schedules": return <Schedules session={session}/>;
    case "todo": return <Tasks session={session}/>;
    case "campaigns": return <Campaigns session={session}/>;
    case "files": return <Files session={session}/>;
    case "integrations": return <Integrations session={session}/>;
    case "users": return <UsersPage session={session}/>;
    case "settings": return <SettingsPage session={session}/>;
    case "chat": return <Info title="Chat interno" icon={<MessagesSquare/>} text="O módulo de chat interno permanece disponível na interface. A camada de conversas internas pode ser conectada ao mesmo Socket.IO do backend quando houver usuários adicionais."/>;
    case "finance": return <Info title="Financeiro" icon={<CircleDollarSign/>} text="Área preparada para planos, faturas e cobrança. O atendimento e WhatsApp não dependem deste módulo para funcionar."/>;
  }
}

function useRemote<T>(path:string, preview:T, token:string, interval=5000){
  const [data,setData]=useState<T>(preview); const [loading,setLoading]=useState(!isPreview); const [error,setError]=useState("");
  const reload=useCallback(async()=>{if(isPreview){setData(preview);setLoading(false);return;}try{setData(await request<T>(path,{},token));setError("")}catch(e:any){setError(e.message)}finally{setLoading(false)}},[path,token]);
  useEffect(()=>{reload();if(isPreview||!interval)return;const id=setInterval(reload,interval);return()=>clearInterval(id)},[reload,interval]);
  return {data,setData,loading,error,reload};
}

function Dashboard({session}:{session:Session}){
  const {data,error,reload}=useRemote<any>("/api/dashboard",demo.dashboard,session.token,7000);
  return <div className="stack"><div className="hero"><div><span className="eyebrow"><Activity size={15}/> Operação em tempo real</span><h2>Olá, {session.user.name}!</h2><p>Acompanhe os principais indicadores da central.</p></div><button className="secondary-btn" onClick={reload}><RefreshCw size={16}/>Atualizar</button></div>{error?<Alert text={error}/>:null}<div className="stat-grid"><Stat label="Abertos" value={data.open} icon={<Headphones/>}/><Stat label="Aguardando" value={data.pending} icon={<Activity/>}/><Stat label="Finalizados" value={data.closed} icon={<CheckCircle2/>}/><Stat label="Contatos" value={data.contacts} icon={<ContactRound/>}/><Stat label="Mensagens" value={data.messages} icon={<MessagesSquare/>}/><Stat label="WhatsApp conectado" value={data.connectedSessions} icon={<Wifi/>}/></div></div>
}

function Tickets({session}:{session:Session}){
  const r=useRemote<any[]>("/api/tickets",demo.tickets,session.token,4000); const [selected,setSelected]=useState<string>(""); const [messages,setMessages]=useState<any[]>([]); const [text,setText]=useState(""); const ticket=r.data.find(t=>t.id===(selected||r.data[0]?.id));
  useEffect(()=>{if(!ticket||isPreview){setMessages(ticket?.id==="t1"?[{id:"m1",fromMe:false,body:"Gostaria de conhecer os planos",createdAt:new Date().toISOString()}]:[]);return;}request<any[]>(`/api/tickets/${ticket.id}/messages`,{},session.token).then(setMessages).catch(()=>{})},[ticket?.id,session.token]);
  async function send(){if(!ticket||!text.trim())return;if(isPreview){setMessages(v=>[...v,{id:Date.now(),fromMe:true,body:text,createdAt:new Date().toISOString()}]);setText("");return;}try{const m=await request<any>(`/api/tickets/${ticket.id}/messages`,{method:"POST",body:JSON.stringify({body:text})},session.token);setMessages(v=>[...v,m]);setText("");r.reload()}catch(e:any){alert(e.message)}}
  async function status(status:string){if(!ticket)return;if(isPreview)return;await request(`/api/tickets/${ticket.id}`,{method:"PATCH",body:JSON.stringify({status})},session.token);r.reload()}
  return <div className="ticket-layout"><section className="panel ticket-list"><div className="toolbar"><div className="search-box"><Search size={16}/><input placeholder="Buscar atendimento"/></div><button className="icon-btn" onClick={r.reload}><RefreshCw size={16}/></button></div>{r.data.map(t=><button key={t.id} className={`ticket-card ${ticket?.id===t.id?"selected":""}`} onClick={()=>setSelected(t.id)}><div className="avatar">{initials(t.contact?.name||"C")}</div><div><strong>{t.contact?.name}</strong><small>{t.queue?.name||"Sem fila"}</small><p>{t.lastMessage||"Sem mensagens"}</p></div>{t.unread?<em>{t.unread}</em>:null}</button>)}</section><section className="panel conversation">{ticket?<><div className="conversation-head"><div><strong>{ticket.contact?.name}</strong><small>{ticket.contact?.number} • {ticket.session?.name||"Sem conexão"}</small></div><div className="row-actions"><button onClick={()=>status("PENDING")}>Aguardar</button><button onClick={()=>status("CLOSED")}>Finalizar</button></div></div><div className="messages">{messages.map(m=><div key={m.id} className={m.fromMe?"bubble mine":"bubble"}><p>{m.body||"Arquivo"}</p><small>{new Date(m.createdAt).toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"})}</small></div>)}</div><div className="composer"><input value={text} onChange={e=>setText(e.target.value)} onKeyDown={e=>{if(e.key==="Enter")send()}} placeholder="Digite uma mensagem..."/><button className="primary-btn" onClick={send}><Send size={17}/></button></div></>:<Empty text="Nenhum atendimento"/>}</section></div>
}

function Connections({session}:{session:Session}){
  const r=useRemote<any[]>("/api/whatsapp",demo.whatsapp,session.token,3500);
  async function add(){const name=prompt("Nome da conexão:","Principal");if(!name)return;if(isPreview)return alert("No preview o QR é apenas ilustrativo. Configure VITE_API_URL para conexão real.");await request("/api/whatsapp",{method:"POST",body:JSON.stringify({name})},session.token);r.reload()}
  async function action(id:string,kind:"connect"|"disconnect"){if(isPreview)return;await request(`/api/whatsapp/${id}/${kind}`,{method:"POST",body:JSON.stringify(kind==="disconnect"?{logout:false}:{})},session.token);r.reload()}
  return <div className="stack"><div className="page-actions"><p>Gerencie sessões persistentes do WhatsApp.</p><button className="primary-btn" onClick={add}><Plus size={16}/>Nova conexão</button></div><div className="cards-grid">{r.data.map(w=><div className="panel connection-card" key={w.id}><div className="connection-icon"><MessageCircleMore/></div><h3>{w.name}</h3><p>{w.phone||"Aguardando leitura do QR Code"}</p><span className={`status ${String(w.status).toLowerCase()}`}>{w.status}</span>{w.qr?<img className="qr-real" src={w.qr} alt="QR Code WhatsApp"/>:null}<div className="row-actions"><button onClick={()=>action(w.id,"connect")}>Conectar</button><button onClick={()=>action(w.id,"disconnect")}>Desconectar</button></div></div>)}</div></div>
}

function Contacts({session}:{session:Session}){
  const r=useRemote<any[]>("/api/contacts",demo.contacts,session.token,5000); const [q,setQ]=useState(""); const rows=useMemo(()=>r.data.filter(c=>`${c.name} ${c.number} ${c.email||""}`.toLowerCase().includes(q.toLowerCase())),[r.data,q]);
  async function add(){const name=prompt("Nome do contato:");if(!name)return;const number=prompt("Número com DDI e DDD:");if(!number)return;const email=prompt("E-mail (opcional):")||"";if(isPreview){r.setData(v=>[...v,{id:String(Date.now()),name,number,email}]);return;}await request("/api/contacts",{method:"POST",body:JSON.stringify({name,number,email})},session.token);r.reload()}
  async function del(id:string){if(!confirm("Excluir este contato?"))return;if(isPreview){r.setData(v=>v.filter(x=>x.id!==id));return;}await request(`/api/contacts/${id}`,{method:"DELETE"},session.token);r.reload()}
  return <div className="stack"><div className="page-actions"><div className="search-box wide"><Search size={16}/><input value={q} onChange={e=>setQ(e.target.value)} placeholder="Buscar contato"/></div><button className="primary-btn" onClick={add}><Plus size={16}/>Novo contato</button></div><section className="panel"><Table heads={["Nome","Número","E-mail",""]} rows={rows.map(c=>[<AvatarName name={c.name}/>,c.number,c.email||"—",<button className="danger-icon" onClick={()=>del(c.id)}><Trash2 size={16}/></button>])}/></section></div>
}

function SimpleCrud({session,title,endpoint,demoRows,fields}:{session:Session;title:string;endpoint:string;demoRows:any[];fields:string[]}){
  const r=useRemote<any[]>(endpoint,demoRows,session.token,5000);
  async function add(){const body:any={};for(const f of fields){const v=prompt(`${label(f)}:`);if(v===null)return;body[f]=v}if(isPreview){r.setData(v=>[...v,{id:String(Date.now()),...body}]);return;}await request(endpoint,{method:"POST",body:JSON.stringify(body)},session.token);r.reload()}
  async function del(id:string){if(isPreview){r.setData(v=>v.filter(x=>x.id!==id));return;}await request(`${endpoint}/${id}`,{method:"DELETE"},session.token);r.reload()}
  return <div className="stack"><div className="page-actions"><p>Cadastros de {title.toLowerCase()}.</p><button className="primary-btn" onClick={add}><Plus size={16}/>Novo</button></div><section className="panel"><Table heads={[...fields.map(label),""]} rows={r.data.map(row=>[...fields.map(f=>row[f]||"—"),<button className="danger-icon" onClick={()=>del(row.id)}><Trash2 size={16}/></button>])}/></section></div>
}

function Kanban({session}:{session:Session}){const r=useRemote<any[]>("/api/tickets",demo.tickets,session.token,4000);const columns=[{s:"OPEN",t:"Em atendimento"},{s:"PENDING",t:"Aguardando"},{s:"CLOSED",t:"Finalizados"}];return <div className="kanban-board">{columns.map(c=><section className="kanban-col" key={c.s}><h3>{c.t}<span>{r.data.filter(t=>t.status===c.s).length}</span></h3>{r.data.filter(t=>t.status===c.s).map(t=><div className="kanban-card" key={t.id}><strong>{t.contact?.name}</strong><p>{t.lastMessage||"Sem mensagens"}</p><small>{t.queue?.name||"Sem fila"}</small></div>)}</section>)}</div>}

function Schedules({session}:{session:Session}){const r=useRemote<any[]>("/api/schedules",demo.schedules,session.token,5000);async function add(){const title=prompt("Título:");if(!title)return;const body=prompt("Mensagem:")||"";const contactNumber=prompt("Número do contato:")||"";const scheduledAt=prompt("Data/hora (AAAA-MM-DDTHH:mm):",new Date(Date.now()+3600000).toISOString().slice(0,16));if(!scheduledAt)return;if(isPreview){r.setData(v=>[...v,{id:String(Date.now()),title,body,contactNumber,scheduledAt:new Date(scheduledAt).toISOString()}]);return;}await request("/api/schedules",{method:"POST",body:JSON.stringify({title,body,contactNumber,scheduledAt})},session.token);r.reload()}return <ListPanel title="Agendamentos" action={add} heads={["Título","Destino","Agendado para","Enviado"]} rows={r.data.map(x=>[x.title,x.contactNumber||"—",fmt(x.scheduledAt),x.sentAt?"Sim":"Não"])} />}

function Tasks({session}:{session:Session}){const r=useRemote<any[]>("/api/tasks",demo.tasks,session.token,5000);async function add(){const title=prompt("Título da tarefa:");if(!title)return;if(isPreview){r.setData(v=>[...v,{id:String(Date.now()),title,status:"TODO"}]);return;}await request("/api/tasks",{method:"POST",body:JSON.stringify({title})},session.token);r.reload()}async function advance(x:any){const next=x.status==="TODO"?"DOING":x.status==="DOING"?"DONE":"TODO";if(isPreview){r.setData(v=>v.map(i=>i.id===x.id?{...i,status:next}:i));return;}await request(`/api/tasks/${x.id}`,{method:"PATCH",body:JSON.stringify({status:next})},session.token);r.reload()}return <div className="stack"><div className="page-actions"><p>Organize atividades da equipe.</p><button className="primary-btn" onClick={add}><Plus size={16}/>Nova tarefa</button></div><div className="cards-grid">{r.data.map(x=><div className="panel task-card" key={x.id}><Tag size={18}/><h3>{x.title}</h3><p>{x.description||"Sem descrição"}</p><button onClick={()=>advance(x)}>{x.status}</button></div>)}</div></div>}

function Campaigns({session}:{session:Session}){const r=useRemote<any[]>("/api/campaigns",demo.campaigns,session.token,6000);async function add(){const name=prompt("Nome da campanha:");if(!name)return;const message=prompt("Mensagem:");if(!message)return;if(isPreview){r.setData(v=>[...v,{id:String(Date.now()),name,message,status:"DRAFT",_count:{contacts:0}}]);return;}await request("/api/campaigns",{method:"POST",body:JSON.stringify({name,message,contactIds:[]})},session.token);r.reload()}async function start(id:string){if(isPreview){r.setData(v=>v.map(x=>x.id===id?{...x,status:"RUNNING"}:x));return;}await request(`/api/campaigns/${id}/start`,{method:"POST"},session.token);r.reload()}return <div className="stack"><div className="page-actions"><p>Crie e acompanhe disparos para listas autorizadas.</p><button className="primary-btn" onClick={add}><Plus size={16}/>Nova campanha</button></div><section className="panel"><Table heads={["Campanha","Status","Destinatários",""]} rows={r.data.map(x=>[x.name,x.status,x._count?.contacts??0,<button onClick={()=>start(x.id)}>Iniciar</button>])}/></section></div>}

function Files({session}:{session:Session}){const r=useRemote<any[]>("/api/files",demo.files,session.token,6000);async function uploadFile(e:React.ChangeEvent<HTMLInputElement>){const file=e.target.files?.[0];if(!file)return;if(isPreview){r.setData(v=>[{id:String(Date.now()),name:file.name,size:file.size,mimeType:file.type,createdAt:new Date().toISOString()},...v]);return;}const form=new FormData();form.append("file",file);try{const row=await request<any>("/api/files",{method:"POST",body:form},session.token);r.setData(v=>[row,...v])}catch(err:any){alert(err.message)}}return <div className="stack"><div className="page-actions"><p>Biblioteca persistente de arquivos.</p><label className="primary-btn file-button"><Plus size={16}/>Enviar arquivo<input type="file" hidden onChange={uploadFile}/></label></div><section className="panel"><Table heads={["Arquivo","Tipo","Tamanho","Data"]} rows={r.data.map(x=>[x.name,x.mimeType||"—",x.size?`${Math.round(x.size/1024)} KB`:"—",x.createdAt?fmt(x.createdAt):"—"])}/></section></div>}

function Integrations({session}:{session:Session}){const r=useRemote<any[]>("/api/api-tokens",[],session.token,0);const [newToken,setNewToken]=useState("");async function add(){if(isPreview){setNewToken("zm_preview_token_exemplo");return;}const name=prompt("Nome do token:","Integração");if(!name)return;const row=await request<any>("/api/api-tokens",{method:"POST",body:JSON.stringify({name})},session.token);setNewToken(row.token);r.reload()}return <div className="stack"><div className="hero"><div><h2>API externa</h2><p>Envie mensagens por integração usando uma chave de API.</p></div><button className="primary-btn" onClick={add}><Plus size={16}/>Gerar token</button></div>{newToken?<div className="panel token-box"><strong>Copie agora — o token completo é exibido somente neste momento:</strong><code>{newToken}</code></div>:null}<section className="panel"><Table heads={["Nome","Ativo","Criado em"]} rows={r.data.map(x=>[x.name,x.active?"Sim":"Não",fmt(x.createdAt)])}/></section><section className="panel api-help"><h3>Envio por API</h3><code>POST {API||"https://api.seudominio.com"}/api/v1/messages/send</code><p>Header: <b>X-API-Key</b> • Body JSON: <b>number</b> e <b>message</b>.</p></section></div>}

function UsersPage({session}:{session:Session}){const r=useRemote<any[]>("/api/users",demo.users,session.token,8000);async function add(){const name=prompt("Nome:");if(!name)return;const email=prompt("E-mail:");if(!email)return;const password=prompt("Senha (mín. 8 caracteres):");if(!password)return;if(isPreview){r.setData(v=>[...v,{id:String(Date.now()),name,email,role:"AGENT",active:true}]);return;}await request("/api/users",{method:"POST",body:JSON.stringify({name,email,password,role:"AGENT"})},session.token);r.reload()}return <ListPanel title="Usuários" action={add} heads={["Nome","E-mail","Perfil","Ativo"]} rows={r.data.map(x=>[x.name,x.email,x.role,x.active?"Sim":"Não"])} />}

function SettingsPage({session}:{session:Session}){const r=useRemote<any[]>("/api/settings",demo.settings,session.token,0);const [key,setKey]=useState("");const [value,setValue]=useState("");async function save(){if(!key.trim())return;if(isPreview){r.setData(v=>[...v.filter(x=>x.key!==key),{id:key,key,value}]);return;}await request(`/api/settings/${encodeURIComponent(key)}`,{method:"PUT",body:JSON.stringify({value})},session.token);r.reload()}return <div className="stack"><section className="panel settings-form"><h3>Configuração</h3><div className="inline-form"><input value={key} onChange={e=>setKey(e.target.value)} placeholder="Chave"/><input value={value} onChange={e=>setValue(e.target.value)} placeholder="Valor"/><button className="primary-btn" onClick={save}>Salvar</button></div></section><section className="panel"><Table heads={["Chave","Valor"]} rows={r.data.map(x=>[x.key,x.value])}/></section></div>}

function ListPanel({title,action,heads,rows}:{title:string;action:()=>void;heads:string[];rows:ReactNode[][]}){return <div className="stack"><div className="page-actions"><p>{title}</p><button className="primary-btn" onClick={action}><Plus size={16}/>Novo</button></div><section className="panel"><Table heads={heads} rows={rows}/></section></div>}
function Table({heads,rows}:{heads:string[];rows:ReactNode[][]}){return <div className="data-table"><div className="data-row data-head">{heads.map((h,i)=><span key={i}>{h}</span>)}</div>{rows.map((r,i)=><div className="data-row" key={i}>{r.map((c,j)=><span key={j}>{c}</span>)}</div>)}{!rows.length?<Empty text="Nenhum registro"/>:null}</div>}
function Stat({label,value,icon}:{label:string;value:any;icon:ReactNode}){return <div className="stat-card"><div className="stat-icon">{icon}</div><div><small>{label}</small><strong>{value??0}</strong></div></div>}
function AvatarName({name}:{name:string}){return <span className="avatar-name"><i className="avatar small">{initials(name)}</i><b>{name}</b></span>}
function Alert({text}:{text:string}){return <div className="form-error">{text}</div>}
function Empty({text}:{text:string}){return <div className="empty-state">{text}</div>}
function Info({title,icon,text}:{title:string;icon:ReactNode;text:string}){return <div className="panel info-card"><div className="connection-icon">{icon}</div><h2>{title}</h2><p>{text}</p></div>}
function initials(name:string){return name.split(/\s+/).filter(Boolean).slice(0,2).map(x=>x[0]).join("").toUpperCase()||"ZM"}
function fmt(v:string){try{return new Date(v).toLocaleString("pt-BR")}catch{return v}}
function label(v:string){return ({name:"Nome",color:"Cor",shortcut:"Atalho",message:"Mensagem"} as any)[v]||v}
