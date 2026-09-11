import { createFileRoute } from "@tanstack/react-router";
import {
  Activity,
  Bell,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  CircleDollarSign,
  Clock3,
  ContactRound,
  FileText,
  Filter,
  Gauge,
  Headphones,
  KanbanSquare,
  ListTodo,
  LogOut,
  Megaphone,
  Menu,
  MessageCircleMore,
  MessagesSquare,
  MoreVertical,
  Paperclip,
  Pencil,
  PlugZap,
  Plus,
  QrCode,
  Search,
  Send,
  Settings,
  ShieldCheck,
  Sparkles,
  Tag,
  Trash2,
  Users,
  Wifi,
  X,
  Zap,
} from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";

export const Route = createFileRoute("/")({ component: ZapModelApp });

type TicketStatus = "open" | "pending" | "closed";
type Ticket = {
  id: number;
  name: string;
  phone: string;
  queue: string;
  status: TicketStatus;
  last: string;
  unread: number;
  time: string;
};
type Contact = { id: number; name: string; phone: string; email: string; tag: string };
type Message = { id: number; ticketId: number; mine: boolean; text: string; time: string };
type NavKey =
  | "dashboard"
  | "tickets"
  | "connections"
  | "contacts"
  | "queues"
  | "quick"
  | "kanban"
  | "schedules"
  | "todo"
  | "campaigns"
  | "chat"
  | "files"
  | "integrations"
  | "users"
  | "finance"
  | "settings";

const initialTickets: Ticket[] = [
  { id: 1001, name: "Maria Oliveira", phone: "5538991112233", queue: "Comercial", status: "open", last: "Gostaria de conhecer os planos", unread: 2, time: "21:18" },
  { id: 1002, name: "João Martins", phone: "5538998765412", queue: "Suporte", status: "pending", last: "Vou reiniciar e testar novamente", unread: 0, time: "20:54" },
  { id: 1003, name: "Empresa Horizonte", phone: "5538993322110", queue: "Financeiro", status: "open", last: "Pode enviar a segunda via?", unread: 1, time: "19:37" },
  { id: 1004, name: "Carlos Souza", phone: "5538995544332", queue: "Comercial", status: "closed", last: "Obrigado pelo atendimento!", unread: 0, time: "18:21" },
];

const initialContacts: Contact[] = [
  { id: 1, name: "Maria Oliveira", phone: "+55 38 99111-2233", email: "maria@exemplo.com", tag: "Cliente" },
  { id: 2, name: "João Martins", phone: "+55 38 99876-5412", email: "joao@exemplo.com", tag: "Suporte" },
  { id: 3, name: "Empresa Horizonte", phone: "+55 38 99332-2110", email: "contato@horizonte.com", tag: "Empresa" },
  { id: 4, name: "Carlos Souza", phone: "+55 38 99554-4332", email: "carlos@exemplo.com", tag: "Lead" },
];

const initialMessages: Message[] = [
  { id: 1, ticketId: 1001, mine: false, text: "Olá! Gostaria de conhecer os planos disponíveis.", time: "21:15" },
  { id: 2, ticketId: 1001, mine: true, text: "Olá, Maria! Claro. Posso te apresentar as opções e tirar suas dúvidas.", time: "21:16" },
  { id: 3, ticketId: 1001, mine: false, text: "Perfeito, gostaria de conhecer os planos.", time: "21:18" },
  { id: 4, ticketId: 1002, mine: true, text: "Pode reiniciar o equipamento e me dizer se o indicador ficou verde?", time: "20:50" },
  { id: 5, ticketId: 1002, mine: false, text: "Vou reiniciar e testar novamente.", time: "20:54" },
];

const nav: { key: NavKey; label: string; icon: ReactNode; group?: string }[] = [
  { key: "dashboard", label: "Dashboard", icon: <Gauge size={19} /> },
  { key: "tickets", label: "Atendimentos", icon: <Headphones size={19} /> },
  { key: "connections", label: "Conexões", icon: <PlugZap size={19} /> },
  { key: "contacts", label: "Contatos", icon: <ContactRound size={19} />, group: "Cadastros" },
  { key: "queues", label: "Filas & Setores", icon: <Users size={19} /> },
  { key: "quick", label: "Respostas rápidas", icon: <Zap size={19} /> },
  { key: "kanban", label: "Kanban", icon: <KanbanSquare size={19} />, group: "Produtividade" },
  { key: "schedules", label: "Agendamentos", icon: <CalendarDays size={19} /> },
  { key: "todo", label: "Tarefas", icon: <ListTodo size={19} /> },
  { key: "campaigns", label: "Campanhas", icon: <Megaphone size={19} />, group: "Comunicação" },
  { key: "chat", label: "Chat interno", icon: <MessagesSquare size={19} /> },
  { key: "files", label: "Arquivos", icon: <FileText size={19} /> },
  { key: "integrations", label: "Integrações/API", icon: <Activity size={19} />, group: "Administração" },
  { key: "users", label: "Usuários", icon: <ShieldCheck size={19} /> },
  { key: "finance", label: "Financeiro", icon: <CircleDollarSign size={19} /> },
  { key: "settings", label: "Configurações", icon: <Settings size={19} /> },
];

function useStoredState<T>(key: string, fallback: T) {
  const [value, setValue] = useState<T>(fallback);
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(key);
      if (raw) setValue(JSON.parse(raw));
    } catch { /* preview storage can be unavailable */ }
  }, [key]);
  useEffect(() => {
    try { window.localStorage.setItem(key, JSON.stringify(value)); } catch { /* noop */ }
  }, [key, value]);
  return [value, setValue] as const;
}

function ZapModelApp() {
  const [authenticated, setAuthenticated] = useStoredState("zapmodel-auth", false);
  const [active, setActive] = useState<NavKey>("dashboard");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [tickets, setTickets] = useStoredState<Ticket[]>("zapmodel-tickets", initialTickets);
  const [contacts, setContacts] = useStoredState<Contact[]>("zapmodel-contacts", initialContacts);
  const [messages, setMessages] = useStoredState<Message[]>("zapmodel-messages", initialMessages);
  const [selectedTicketId, setSelectedTicketId] = useState(1001);

  if (!authenticated) return <Login onLogin={() => setAuthenticated(true)} />;

  const pageTitle = nav.find((item) => item.key === active)?.label ?? "ZapModel";
  return (
    <div className="app-shell">
      <aside className={`sidebar ${sidebarOpen ? "sidebar-open" : ""}`}>
        <div className="brand"><span className="brand-mark"><MessageCircleMore size={24} /></span><div><b>ZapModel</b><small>Omnichannel</small></div></div>
        <nav className="nav-list">
          {nav.map((item, index) => {
            const previousGroup = index === 0 ? undefined : nav[index - 1].group;
            return <div key={item.key}>
              {item.group && item.group !== previousGroup && <div className="nav-group">{item.group}</div>}
              <button className={active === item.key ? "nav-item active" : "nav-item"} onClick={() => { setActive(item.key); setSidebarOpen(false); }}>
                {item.icon}<span>{item.label}</span>{item.key === "tickets" && <em>{tickets.filter(t => t.status !== "closed").length}</em>}
              </button>
            </div>;
          })}
        </nav>
        <div className="sidebar-footer"><div className="avatar">AM</div><div><strong>Administrador</strong><small>Online</small></div><button title="Sair" onClick={() => setAuthenticated(false)}><LogOut size={18} /></button></div>
      </aside>

      <div className="main-area">
        <header className="topbar">
          <button className="mobile-menu" onClick={() => setSidebarOpen(v => !v)}><Menu size={22} /></button>
          <div><h1>{pageTitle}</h1><p>Central de atendimento e relacionamento</p></div>
          <div className="top-actions"><span className="online-pill"><i /> WhatsApp conectado</span><button className="icon-btn"><Bell size={19} /><b className="dot" /></button><div className="avatar small">AM</div></div>
        </header>
        <main className="content">
          {active === "dashboard" && <Dashboard tickets={tickets} contacts={contacts} />}
          {active === "tickets" && <TicketsPage tickets={tickets} setTickets={setTickets} messages={messages} setMessages={setMessages} selectedTicketId={selectedTicketId} setSelectedTicketId={setSelectedTicketId} />}
          {active === "connections" && <ConnectionsPage />}
          {active === "contacts" && <ContactsPage contacts={contacts} setContacts={setContacts} />}
          {active === "queues" && <QueuesPage />}
          {active === "quick" && <QuickMessagesPage />}
          {active === "kanban" && <KanbanPage />}
          {active === "schedules" && <SchedulesPage />}
          {active === "todo" && <TodoPage />}
          {active === "campaigns" && <CampaignsPage />}
          {active === "chat" && <InternalChat />}
          {active === "files" && <FilesPage />}
          {active === "integrations" && <IntegrationsPage />}
          {active === "users" && <UsersPage />}
          {active === "finance" && <FinancePage />}
          {active === "settings" && <SettingsPage />}
        </main>
      </div>
      {sidebarOpen && <button aria-label="Fechar menu" className="sidebar-backdrop" onClick={() => setSidebarOpen(false)} />}
    </div>
  );
}

function Login({ onLogin }: { onLogin: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) return setError("Informe e-mail e senha para continuar.");
    setError(""); onLogin();
  };
  return <div className="login-page"><div className="login-decoration d1"/><div className="login-decoration d2"/><form className="login-card" onSubmit={submit}>
    <div className="login-logo"><MessageCircleMore size={34}/></div><h1>ZapModel</h1><p>Entre para acessar sua central de atendimento.</p>
    <label>E-mail<input value={email} onChange={e=>setEmail(e.target.value)} placeholder="seuemail@empresa.com" type="email" /></label>
    <label>Senha<input value={password} onChange={e=>setPassword(e.target.value)} placeholder="••••••••" type="password" /></label>
    {error && <div className="form-error">{error}</div>}<button className="primary-btn login-btn" type="submit">Entrar</button>
    <small className="login-note">Ambiente de demonstração: qualquer e-mail e senha preenchidos liberam o acesso.</small>
  </form></div>;
}

function Dashboard({ tickets, contacts }: { tickets: Ticket[]; contacts: Contact[] }) {
  const open = tickets.filter(t=>t.status==="open").length;
  const pending = tickets.filter(t=>t.status==="pending").length;
  const closed = tickets.filter(t=>t.status==="closed").length;
  return <div className="stack">
    <div className="hero"><div><span className="eyebrow"><Sparkles size={15}/> Visão geral</span><h2>Boa noite, Administrador!</h2><p>Acompanhe o desempenho da operação e os atendimentos em tempo real.</p></div><button className="primary-btn"><Plus size={17}/> Novo atendimento</button></div>
    <div className="stat-grid">
      <Stat icon={<Headphones/>} label="Atendimentos abertos" value={open} trend="+12% hoje" tone="green" />
      <Stat icon={<Clock3/>} label="Aguardando" value={pending} trend="Tempo médio 4 min" tone="amber" />
      <Stat icon={<CheckCircle2/>} label="Finalizados" value={closed + 38} trend="+8% esta semana" tone="blue" />
      <Stat icon={<ContactRound/>} label="Contatos" value={contacts.length + 1246} trend="+27 este mês" tone="violet" />
    </div>
    <div className="dashboard-grid">
      <section className="panel chart-panel"><PanelTitle title="Atendimentos nos últimos 7 dias" subtitle="Entradas e finalizações"/><div className="bars">
        {[{d:"Sex",v:54},{d:"Sáb",v:32},{d:"Dom",v:24},{d:"Seg",v:71},{d:"Ter",v:63},{d:"Qua",v:82},{d:"Hoje",v:68}].map(x=><div className="bar-col" key={x.d}><div className="bar-value">{x.v}</div><div className="bar" style={{height:`${x.v*1.55}px`}}/><small>{x.d}</small></div>)}
      </div></section>
      <section className="panel"><PanelTitle title="Filas" subtitle="Distribuição atual"/><div className="queue-metrics">
        <Progress label="Comercial" value={74} count={18}/><Progress label="Suporte" value={58} count={12}/><Progress label="Financeiro" value={32} count={7}/><Progress label="Pós-venda" value={21} count={4}/>
      </div></section>
    </div>
    <section className="panel"><PanelTitle title="Atendimentos recentes" subtitle="Últimas movimentações da equipe"/><div className="simple-table"><div className="tr th"><span>Contato</span><span>Fila</span><span>Status</span><span>Última mensagem</span></div>{tickets.map(t=><div className="tr" key={t.id}><span><AvatarName name={t.name}/></span><span>{t.queue}</span><span><Status status={t.status}/></span><span className="muted">{t.last}</span></div>)}</div></section>
  </div>;
}

function TicketsPage({tickets,setTickets,messages,setMessages,selectedTicketId,setSelectedTicketId}:{tickets:Ticket[];setTickets:(v:Ticket[])=>void;messages:Message[];setMessages:(v:Message[])=>void;selectedTicketId:number;setSelectedTicketId:(id:number)=>void}) {
  const [filter,setFilter]=useState<"all"|TicketStatus>("all"); const [search,setSearch]=useState(""); const [text,setText]=useState("");
  const selected=tickets.find(t=>t.id===selectedTicketId) ?? tickets[0];
  const visible=tickets.filter(t=>(filter==="all"||t.status===filter) && (t.name.toLowerCase().includes(search.toLowerCase())||t.phone.includes(search)));
  const send=()=>{if(!text.trim()||!selected)return; const now=new Date(); const time=now.toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"}); setMessages([...messages,{id:Date.now(),ticketId:selected.id,mine:true,text:text.trim(),time}]); setTickets(tickets.map(t=>t.id===selected.id?{...t,last:text.trim(),time}:t)); setText("");};
  return <div className="tickets-layout">
    <section className="ticket-sidebar panel"><div className="ticket-search"><div className="searchbox"><Search size={17}/><input placeholder="Buscar atendimento..." value={search} onChange={e=>setSearch(e.target.value)}/></div><button className="square-btn"><Plus size={18}/></button></div>
      <div className="ticket-filters">{(["all","open","pending","closed"] as const).map(f=><button className={filter===f?"active":""} key={f} onClick={()=>setFilter(f)}>{f==="all"?"Todos":f==="open"?"Abertos":f==="pending"?"Aguardando":"Fechados"}</button>)}</div>
      <div className="ticket-list">{visible.map(t=><button key={t.id} onClick={()=>setSelectedTicketId(t.id)} className={selected?.id===t.id?"ticket-row selected":"ticket-row"}><div className="avatar">{initials(t.name)}</div><div className="ticket-copy"><div><strong>{t.name}</strong><small>{t.time}</small></div><p>{t.last}</p><div className="ticket-meta"><span>{t.queue}</span>{t.unread>0&&<b>{t.unread}</b>}</div></div></button>)}</div>
    </section>
    <section className="chat-panel panel">{selected ? <><div className="chat-head"><AvatarName name={selected.name}/><div className="chat-head-actions"><Status status={selected.status}/><button className="icon-btn"><MoreVertical size={19}/></button></div></div>
      <div className="chat-body">{messages.filter(m=>m.ticketId===selected.id).map(m=><div key={m.id} className={m.mine?"bubble mine":"bubble"}>{m.text}<small>{m.time} {m.mine&&<Check size={12}/>}</small></div>)}</div>
      <div className="chat-compose"><button><Paperclip size={20}/></button><input value={text} onChange={e=>setText(e.target.value)} onKeyDown={e=>{if(e.key==="Enter")send()}} placeholder="Digite uma mensagem..."/><button className="send-btn" onClick={send}><Send size={19}/></button></div>
    </>:<div className="empty">Selecione um atendimento</div>}</section>
    <aside className="contact-drawer panel">{selected&&<><div className="profile-avatar">{initials(selected.name)}</div><h3>{selected.name}</h3><p>+{selected.phone}</p><div className="detail-list"><div><small>Fila</small><strong>{selected.queue}</strong></div><div><small>Status</small><Status status={selected.status}/></div><div><small>Protocolo</small><strong>#{selected.id}</strong></div></div><div className="drawer-actions"><button onClick={()=>setTickets(tickets.map(t=>t.id===selected.id?{...t,status:"pending"}:t))}>Aguardar</button><button className="success" onClick={()=>setTickets(tickets.map(t=>t.id===selected.id?{...t,status:"closed"}:t))}>Finalizar</button></div></>}</aside>
  </div>;
}

function ConnectionsPage(){const [status,setStatus]=useStoredState("zapmodel-connection","CONNECTED"); const [qr,setQr]=useState(false);return <div className="stack"><PageActions title="Conexões WhatsApp" subtitle="Gerencie os números conectados à plataforma" action="Nova conexão"/>
<section className="panel connection-card"><div className="connection-main"><div className="wa-icon"><MessageCircleMore/></div><div><h3>WhatsApp Principal</h3><p>+55 38 99999-0000</p><span className={status==="CONNECTED"?"connection-status on":"connection-status"}><i/>{status==="CONNECTED"?"Conectado":"Desconectado"}</span></div></div><div className="connection-info"><div><small>Última atualização</small><strong>Agora</strong></div><div><small>Sessão</small><strong>Baileys</strong></div><div className="connection-buttons"><button onClick={()=>setQr(true)}><QrCode size={17}/> QR Code</button><button onClick={()=>setStatus(status==="CONNECTED"?"DISCONNECTED":"CONNECTED")}>{status==="CONNECTED"?"Desconectar":"Reconectar"}</button></div></div></section>
{qr&&<Modal title="Conectar WhatsApp" onClose={()=>setQr(false)}><div className="fake-qr"><QrCode size={170}/></div><p className="center muted">No WhatsApp, abra <b>Aparelhos conectados</b> e leia o QR Code.</p><button className="primary-btn full" onClick={()=>{setStatus("CONNECTED");setQr(false)}}>Simular leitura do QR Code</button></Modal>}</div>}

function ContactsPage({contacts,setContacts}:{contacts:Contact[];setContacts:(v:Contact[])=>void}){const [search,setSearch]=useState("");const [modal,setModal]=useState(false);const [form,setForm]=useState({name:"",phone:"",email:"",tag:"Cliente"});const filtered=contacts.filter(c=>`${c.name} ${c.phone} ${c.email}`.toLowerCase().includes(search.toLowerCase()));const add=()=>{if(!form.name||!form.phone)return;setContacts([...contacts,{id:Date.now(),...form}]);setForm({name:"",phone:"",email:"",tag:"Cliente"});setModal(false)};return <div className="stack"><PageActions title="Contatos" subtitle={`${contacts.length} contatos cadastrados`} action="Novo contato" onAction={()=>setModal(true)}/><section className="panel"><Toolbar search={search} setSearch={setSearch}/><div className="simple-table contacts-table"><div className="tr th"><span>Nome</span><span>Telefone</span><span>E-mail</span><span>Tag</span><span>Ações</span></div>{filtered.map(c=><div className="tr" key={c.id}><span><AvatarName name={c.name}/></span><span>{c.phone}</span><span className="muted">{c.email||"—"}</span><span><span className="tag-pill">{c.tag}</span></span><span><button className="table-action"><Pencil size={16}/></button><button className="table-action danger" onClick={()=>setContacts(contacts.filter(x=>x.id!==c.id))}><Trash2 size={16}/></button></span></div>)}</div></section>{modal&&<Modal title="Novo contato" onClose={()=>setModal(false)}><FormField label="Nome"><input value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/></FormField><FormField label="Telefone"><input value={form.phone} onChange={e=>setForm({...form,phone:e.target.value})}/></FormField><FormField label="E-mail"><input value={form.email} onChange={e=>setForm({...form,email:e.target.value})}/></FormField><FormField label="Tag"><select value={form.tag} onChange={e=>setForm({...form,tag:e.target.value})}><option>Cliente</option><option>Lead</option><option>Empresa</option><option>Suporte</option></select></FormField><button className="primary-btn full" onClick={add}>Salvar contato</button></Modal>}</div>}

function QueuesPage(){const [queues,setQueues]=useStoredState("zapmodel-queues",[{id:1,name:"Comercial",color:"#22c55e",greeting:"Olá! Você está falando com o Comercial."},{id:2,name:"Suporte",color:"#3b82f6",greeting:"Olá! Como podemos ajudar?"},{id:3,name:"Financeiro",color:"#f59e0b",greeting:"Olá! Bem-vindo ao Financeiro."}]);return <div className="stack"><PageActions title="Filas & Setores" subtitle="Organize a distribuição dos atendimentos" action="Nova fila" onAction={()=>setQueues([...queues,{id:Date.now(),name:`Nova fila ${queues.length+1}`,color:"#8b5cf6",greeting:"Mensagem de saudação"}])}/><div className="card-grid">{queues.map(q=><div className="panel queue-card" key={q.id}><div className="queue-card-head"><span className="color-dot" style={{background:q.color}}/><h3>{q.name}</h3><button className="table-action danger" onClick={()=>setQueues(queues.filter(x=>x.id!==q.id))}><Trash2 size={16}/></button></div><p>{q.greeting}</p><div className="queue-card-foot"><span><Users size={15}/> {Math.floor(Math.random()*5)+2} atendentes</span><span><MessageCircleMore size={15}/> {Math.floor(Math.random()*12)+2} em atendimento</span></div></div>)}</div></div>}

function QuickMessagesPage(){const [items,setItems]=useStoredState("zapmodel-quick",[{id:1,key:"/ola",text:"Olá! Tudo bem? Como posso ajudar você hoje?"},{id:2,key:"/aguarde",text:"Só um instante, por favor. Estou verificando sua solicitação."},{id:3,key:"/finalizar",text:"Foi um prazer atender você! Se precisar, estamos à disposição."}]);return <div className="stack"><PageActions title="Respostas rápidas" subtitle="Atalhos para mensagens usadas com frequência" action="Nova resposta" onAction={()=>setItems([...items,{id:Date.now(),key:`/atalho${items.length+1}`,text:"Edite esta nova resposta rápida."}])}/><section className="panel"><div className="simple-table"><div className="tr th quick-row"><span>Atalho</span><span>Mensagem</span><span>Ações</span></div>{items.map(i=><div className="tr quick-row" key={i.id}><span><code>{i.key}</code></span><span>{i.text}</span><span><button className="table-action danger" onClick={()=>setItems(items.filter(x=>x.id!==i.id))}><Trash2 size={16}/></button></span></div>)}</div></section></div>}

function KanbanPage(){const [cards,setCards]=useStoredState("zapmodel-kanban",[{id:1,title:"Maria Oliveira",col:"Novo",note:"Interessada no plano empresarial"},{id:2,title:"Carlos Souza",col:"Em negociação",note:"Aguardando proposta"},{id:3,title:"Empresa Horizonte",col:"Em negociação",note:"Follow-up amanhã"},{id:4,title:"João Martins",col:"Concluído",note:"Contrato enviado"}]);const cols=["Novo","Em negociação","Concluído"];const move=(id:number,dir:number)=>setCards(cards.map(c=>{if(c.id!==id)return c;const i=cols.indexOf(c.col);return {...c,col:cols[Math.max(0,Math.min(cols.length-1,i+dir))]}}));return <div className="stack"><PageActions title="Kanban" subtitle="Acompanhe oportunidades e etapas do atendimento" action="Novo card" onAction={()=>setCards([...cards,{id:Date.now(),title:"Novo contato",col:"Novo",note:"Nova oportunidade"}])}/><div className="kanban-board">{cols.map(col=><section className="kanban-col" key={col}><div className="kanban-title"><span>{col}</span><b>{cards.filter(c=>c.col===col).length}</b></div>{cards.filter(c=>c.col===col).map(c=><article className="kanban-card" key={c.id}><h4>{c.title}</h4><p>{c.note}</p><div><button disabled={col===cols[0]} onClick={()=>move(c.id,-1)}>←</button><button disabled={col===cols[2]} onClick={()=>move(c.id,1)}>→</button></div></article>)}</section>)}</div></div>}

function SchedulesPage(){const [items,setItems]=useStoredState("zapmodel-schedules",[{id:1,name:"Maria Oliveira",date:"11/09/2026 09:00",text:"Enviar apresentação comercial",status:"Agendado"},{id:2,name:"Empresa Horizonte",date:"11/09/2026 14:30",text:"Confirmar recebimento da fatura",status:"Agendado"},{id:3,name:"Carlos Souza",date:"12/09/2026 10:00",text:"Realizar follow-up",status:"Pendente"}]);return <div className="stack"><PageActions title="Agendamentos" subtitle="Mensagens e compromissos programados" action="Novo agendamento" onAction={()=>setItems([...items,{id:Date.now(),name:"Novo contato",date:"12/09/2026 15:00",text:"Nova mensagem agendada",status:"Agendado"}])}/><section className="panel"><div className="simple-table"><div className="tr th schedule-row"><span>Contato</span><span>Data e hora</span><span>Mensagem</span><span>Status</span></div>{items.map(i=><div className="tr schedule-row" key={i.id}><span><AvatarName name={i.name}/></span><span>{i.date}</span><span>{i.text}</span><span><span className="tag-pill">{i.status}</span></span></div>)}</div></section></div>}

function TodoPage(){const [items,setItems]=useStoredState("zapmodel-todo",[{id:1,text:"Revisar atendimentos pendentes",done:false},{id:2,text:"Atualizar mensagem automática da fila Comercial",done:true},{id:3,text:"Retornar contato da Empresa Horizonte",done:false}]);const [text,setText]=useState("");return <div className="stack"><PageActions title="Tarefas" subtitle="Organize as atividades da equipe"/><section className="panel todo-panel"><div className="todo-add"><input placeholder="Nova tarefa..." value={text} onChange={e=>setText(e.target.value)}/><button className="primary-btn" onClick={()=>{if(text.trim()){setItems([...items,{id:Date.now(),text,done:false}]);setText("")}}}><Plus size={17}/> Adicionar</button></div>{items.map(i=><div className={i.done?"todo-item done":"todo-item"} key={i.id}><button onClick={()=>setItems(items.map(x=>x.id===i.id?{...x,done:!x.done}:x))}>{i.done?<CheckCircle2/>:<span/>}</button><p>{i.text}</p><button className="table-action danger" onClick={()=>setItems(items.filter(x=>x.id!==i.id))}><Trash2 size={16}/></button></div>)}</section></div>}

function CampaignsPage(){const [campaigns,setCampaigns]=useStoredState("zapmodel-campaigns",[{id:1,name:"Renovação de clientes",list:"Clientes ativos",sent:842,total:1000,status:"Em andamento"},{id:2,name:"Novidades Setembro",list:"Leads 2026",sent:520,total:520,status:"Finalizada"},{id:3,name:"Pesquisa de satisfação",list:"Pós-venda",sent:0,total:315,status:"Programada"}]);return <div className="stack"><PageActions title="Campanhas" subtitle="Envios em massa, listas e acompanhamento" action="Nova campanha" onAction={()=>setCampaigns([...campaigns,{id:Date.now(),name:"Nova campanha",list:"Todos os contatos",sent:0,total:100,status:"Rascunho"}])}/><div className="card-grid campaign-grid">{campaigns.map(c=><div className="panel campaign-card" key={c.id}><div className="campaign-head"><Megaphone/><StatusText text={c.status}/></div><h3>{c.name}</h3><p>Lista: {c.list}</p><Progress label={`${c.sent} de ${c.total} enviados`} value={Math.round(c.sent/c.total*100)||0} count={Math.round(c.sent/c.total*100)||0}/><div className="campaign-actions"><button>Relatório</button><button onClick={()=>setCampaigns(campaigns.filter(x=>x.id!==c.id))}><Trash2 size={15}/></button></div></div>)}</div></div>}

function InternalChat(){const [text,setText]=useState("");const [msgs,setMsgs]=useStoredState("zapmodel-internal-chat",[{id:1,name:"Ana",mine:false,text:"Bom dia! O atendimento 1002 ficou com o Suporte.",time:"20:12"},{id:2,name:"Você",mine:true,text:"Perfeito, obrigado!",time:"20:13"}]);return <div className="internal-chat panel"><div className="room-list"><h3>Conversas</h3><button className="room active"><div className="avatar">ES</div><span><b>Equipe Suporte</b><small>4 participantes</small></span></button><button className="room"><div className="avatar">CO</div><span><b>Comercial</b><small>6 participantes</small></span></button></div><div className="room-chat"><div className="room-head"><b>Equipe Suporte</b><span>4 membros online</span></div><div className="chat-body">{msgs.map(m=><div className={m.mine?"bubble mine":"bubble"} key={m.id}>{!m.mine&&<b className="sender">{m.name}</b>}{m.text}<small>{m.time}</small></div>)}</div><div className="chat-compose"><input value={text} onChange={e=>setText(e.target.value)} placeholder="Mensagem para a equipe..."/><button className="send-btn" onClick={()=>{if(text.trim()){setMsgs([...msgs,{id:Date.now(),name:"Você",mine:true,text,time:new Date().toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"})}]);setText("")}}}><Send size={18}/></button></div></div></div>}

function FilesPage(){const [files,setFiles]=useStoredState("zapmodel-files",[{id:1,name:"Tabela-de-precos.pdf",size:"1,2 MB",type:"PDF"},{id:2,name:"Apresentacao-comercial.pdf",size:"3,7 MB",type:"PDF"},{id:3,name:"Manual-suporte.docx",size:"842 KB",type:"DOCX"}]);return <div className="stack"><PageActions title="Arquivos" subtitle="Biblioteca compartilhada para os atendimentos" action="Adicionar arquivo" onAction={()=>setFiles([...files,{id:Date.now(),name:`arquivo-${files.length+1}.pdf`,size:"320 KB",type:"PDF"}])}/><div className="file-grid">{files.map(f=><div className="panel file-card" key={f.id}><div className="file-icon"><FileText/></div><h4>{f.name}</h4><p>{f.type} • {f.size}</p><button className="table-action danger" onClick={()=>setFiles(files.filter(x=>x.id!==f.id))}><Trash2 size={16}/></button></div>)}</div></div>}

function IntegrationsPage(){return <div className="stack"><PageActions title="Integrações & API" subtitle="Conecte automações e serviços externos"/><div className="card-grid"><Integration icon={<Activity/>} title="Webhook" desc="Receba eventos de tickets, mensagens e contatos" status="Ativo"/><Integration icon={<Sparkles/>} title="OpenAI" desc="Prompts e assistência por inteligência artificial" status="Configurar"/><Integration icon={<PlugZap/>} title="Typebot" desc="Integração de fluxos automatizados" status="Configurar"/><Integration icon={<Wifi/>} title="n8n" desc="Automação de processos e integrações" status="Configurar"/></div><section className="panel api-box"><PanelTitle title="Endpoint de mensagens" subtitle="Utilize este endereço para integrações externas"/><code>POST https://api.seudominio.com/api/messages/send</code><div className="token-row"><span>Token da API</span><code>zm_live_••••••••••••••••f82a</code><button>Copiar</button></div></section></div>}

function UsersPage(){const [users,setUsers]=useStoredState("zapmodel-users",[{id:1,name:"Administrador",email:"admin@empresa.com",role:"Administrador",status:"Online"},{id:2,name:"Ana Martins",email:"ana@empresa.com",role:"Atendente",status:"Online"},{id:3,name:"Paulo Souza",email:"paulo@empresa.com",role:"Atendente",status:"Offline"}]);return <div className="stack"><PageActions title="Usuários" subtitle="Gerencie acessos e permissões" action="Novo usuário" onAction={()=>setUsers([...users,{id:Date.now(),name:`Usuário ${users.length+1}`,email:`usuario${users.length+1}@empresa.com`,role:"Atendente",status:"Offline"}])}/><section className="panel"><div className="simple-table"><div className="tr th user-row"><span>Usuário</span><span>E-mail</span><span>Perfil</span><span>Status</span><span>Ações</span></div>{users.map(u=><div className="tr user-row" key={u.id}><span><AvatarName name={u.name}/></span><span>{u.email}</span><span>{u.role}</span><span><span className={u.status==="Online"?"connection-status on":"connection-status"}><i/>{u.status}</span></span><span><button className="table-action danger" disabled={u.id===1} onClick={()=>setUsers(users.filter(x=>x.id!==u.id))}><Trash2 size={16}/></button></span></div>)}</div></section></div>}

function FinancePage(){return <div className="stack"><PageActions title="Financeiro" subtitle="Plano, assinatura e consumo"/><div className="stat-grid"><Stat icon={<CircleDollarSign/>} label="Plano atual" value="PRO" trend="Renova em 01/10/2026" tone="green"/><Stat icon={<Users/>} label="Usuários" value="3 / 10" trend="7 vagas disponíveis" tone="blue"/><Stat icon={<MessageCircleMore/>} label="Conexões" value="1 / 5" trend="4 conexões disponíveis" tone="violet"/><Stat icon={<Activity/>} label="Mensagens no mês" value="8.492" trend="Dentro do limite" tone="amber"/></div><section className="panel billing-card"><div><span className="eyebrow">Plano profissional</span><h2>R$ 199,90 <small>/ mês</small></h2><p>Atendimento omnichannel com campanhas, integrações e múltiplos usuários.</p></div><button className="primary-btn">Gerenciar assinatura</button></section></div>}

function SettingsPage(){const [saved,setSaved]=useState(false);const [company,setCompany]=useStoredState("zapmodel-company",{name:"Minha Empresa",email:"contato@empresa.com",timezone:"America/Sao_Paulo",transfer:"30",dark:false});return <div className="settings-grid"><section className="panel settings-menu"><button className="active"><Settings/> Geral</button><button><MessageCircleMore/> Atendimento</button><button><Bell/> Notificações</button><button><ShieldCheck/> Segurança</button></section><section className="panel settings-form"><PanelTitle title="Configurações gerais" subtitle="Dados e preferências da plataforma"/><div className="form-grid"><FormField label="Nome da empresa"><input value={company.name} onChange={e=>setCompany({...company,name:e.target.value})}/></FormField><FormField label="E-mail"><input value={company.email} onChange={e=>setCompany({...company,email:e.target.value})}/></FormField><FormField label="Fuso horário"><select value={company.timezone} onChange={e=>setCompany({...company,timezone:e.target.value})}><option>America/Sao_Paulo</option><option>America/Manaus</option></select></FormField><FormField label="Transferência automática (min)"><input value={company.transfer} onChange={e=>setCompany({...company,transfer:e.target.value})}/></FormField></div><div className="switch-row"><div><b>Modo escuro</b><p>Preferência visual dos usuários</p></div><button className={company.dark?"switch on":"switch"} onClick={()=>setCompany({...company,dark:!company.dark})}><span/></button></div><button className="primary-btn" onClick={()=>{setSaved(true);setTimeout(()=>setSaved(false),1800)}}>{saved?<><Check size={17}/> Salvo</>:"Salvar alterações"}</button></section></div>}

function Stat({icon,label,value,trend,tone}:{icon:ReactNode;label:string;value:string|number;trend:string;tone:string}){return <div className="panel stat-card"><div className={`stat-icon ${tone}`}>{icon}</div><div><p>{label}</p><h3>{value}</h3><small>{trend}</small></div></div>}
function PanelTitle({title,subtitle}:{title:string;subtitle:string}){return <div className="panel-title"><div><h3>{title}</h3><p>{subtitle}</p></div><button className="icon-btn"><MoreVertical size={18}/></button></div>}
function Progress({label,value,count}:{label:string;value:number;count:number}){return <div className="progress-row"><div><span>{label}</span><b>{count}</b></div><div className="progress-track"><i style={{width:`${Math.max(0,Math.min(value,100))}%`}}/></div></div>}
function Status({status}:{status:TicketStatus}){const map={open:["Aberto","green"],pending:["Aguardando","amber"],closed:["Finalizado","gray"]} as const;return <span className={`status ${map[status][1]}`}><i/>{map[status][0]}</span>}
function StatusText({text}:{text:string}){return <span className="tag-pill">{text}</span>}
function initials(name:string){return name.split(" ").slice(0,2).map(x=>x[0]).join("").toUpperCase()}
function AvatarName({name}:{name:string}){return <span className="avatar-name"><span className="avatar">{initials(name)}</span><strong>{name}</strong></span>}
function PageActions({title,subtitle,action,onAction}:{title:string;subtitle:string;action?:string;onAction?:()=>void}){return <div className="page-actions"><div><h2>{title}</h2><p>{subtitle}</p></div>{action&&<button className="primary-btn" onClick={onAction}><Plus size={17}/>{action}</button>}</div>}
function Toolbar({search,setSearch}:{search:string;setSearch:(v:string)=>void}){return <div className="toolbar"><div className="searchbox wide"><Search size={17}/><input placeholder="Pesquisar..." value={search} onChange={e=>setSearch(e.target.value)}/></div><button className="secondary-btn"><Filter size={16}/> Filtros <ChevronDown size={15}/></button></div>}
function Modal({title,onClose,children}:{title:string;onClose:()=>void;children:ReactNode}){return <div className="modal-backdrop"><div className="modal"><div className="modal-head"><h3>{title}</h3><button onClick={onClose}><X size={20}/></button></div><div className="modal-body">{children}</div></div></div>}
function FormField({label,children}:{label:string;children:ReactNode}){return <label className="form-field"><span>{label}</span>{children}</label>}
function Integration({icon,title,desc,status}:{icon:ReactNode;title:string;desc:string;status:string}){return <div className="panel integration-card"><div className="integration-icon">{icon}</div><div><h3>{title}</h3><p>{desc}</p></div><button>{status}</button></div>}
