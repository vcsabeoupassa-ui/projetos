let state={db:null,user:null,page:"dashboard"};

const $=s=>document.querySelector(s);
const esc=s=>String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]));
const money=n=>Number(n||0).toLocaleString("pt-BR",{minimumFractionDigits:3,maximumFractionDigits:3});
const num=n=>Number(n||0).toLocaleString("pt-BR",{minimumFractionDigits:2,maximumFractionDigits:2});
const today=()=>new Date().toISOString().slice(0,10);

async function api(url,opt={}){
  const r=await fetch(url,{headers:{"Content-Type":"application/json",...(opt.headers||{})},...opt});
  const d=await r.json().catch(()=>({}));
  if(!r.ok) throw new Error(d.erro||"Erro na operação.");
  return d;
}
function toast(msg,error=false){const x=document.createElement("div");x.className="toast"+(error?" error":"");x.textContent=msg;$("#toast").append(x);setTimeout(()=>x.remove(),3000)}
async function refresh(){state.db=await api("/api/dados")}
function active(a){return (a||[]).filter(x=>x.ativo!==false)}
function typeName(c){return active(state.db.tipos).find(x=>x.codigo===c)?.nome||c}
function costName(id){return active(state.db.costureiras).find(x=>x.id===id)?.nome||"—"}
function sub(id){return state.db.subservicos.find(x=>x.id===id)}

$("#loginForm").addEventListener("submit",async e=>{
  e.preventDefault();
  try{
    state.user=await api("/api/login",{method:"POST",body:JSON.stringify({login:$("#login").value,senha:$("#senha").value})});
    await refresh(); $("#loginView").classList.add("hidden");$("#appView").classList.remove("hidden");
    $("#userName").textContent=`${state.user.nome} · ${state.user.perfil}`;
    $("#adminNav").classList.toggle("hidden",state.user.perfil!=="admin");
    go(state.user.perfil==="admin"?"dashboard":"lancamento");
  }catch(err){toast(err.message,true)}
});
$("#logoutBtn").onclick=()=>location.reload();
document.addEventListener("click",e=>{const n=e.target.closest(".nav");if(n)go(n.dataset.page)});

async function go(page){state.page=page;document.querySelectorAll(".nav").forEach(x=>x.classList.toggle("active",x.dataset.page===page));await refresh();render()}

function render(){
  const pages={dashboard:dashboard,lancamento:lancamento,historico:historico,relatorios:relatorios,costureiras:costureiras,tipos:tipos,subservicos:subservicos,backup:backup};
  if(state.user.perfil!=="admin" && ["costureiras","tipos","subservicos","backup"].includes(state.page)) state.page="lancamento";
  pages[state.page]?.();
}

function head(title,subt,actions=""){return `<div class="page-head"><div><h1>${title}</h1><p>${subt||""}</p></div><div class="toolbar">${actions}</div></div>`}

function dashboard(){
  const d=state.db, ls=d.lancamentos, totalQtd=ls.reduce((a,x)=>a+Number(x.quantidade),0), totalProd=ls.reduce((a,x)=>a+Number(x.producaoFracionada),0);
  const byC={};ls.forEach(x=>byC[x.costureiraId]=(byC[x.costureiraId]||0)+Number(x.producaoFracionada));
  const ranking=Object.entries(byC).sort((a,b)=>b[1]-a[1]);
  $("#main").innerHTML=head("Painel de produção","Acompanhe a produção por quantidade e produção fracionada.",`<button class="primary" onclick="go('relatorios')">📈 Abrir relatórios</button>`)+
  `<div class="grid">
    <div class="card stat"><div class="label">Lançamentos</div><div class="value">${ls.length}</div></div>
    <div class="card stat"><div class="label">Quantidade executada</div><div class="value">${num(totalQtd)}</div></div>
    <div class="card stat"><div class="label">Produção fracionada</div><div class="value">${num(totalProd)}</div></div>
    <div class="card stat"><div class="label">Costureiras</div><div class="value">${active(d.costureiras).length}</div></div>
  </div>
  <div class="grid-2 section">
    <div class="card"><h3>Ranking por produção fracionada</h3>${ranking.length?`<div class="bar-list">${ranking.map(([id,v])=>{let max=ranking[0][1]||1;return `<div class="bar-item"><span>${esc(costName(Number(id)))}</span><div class="bar"><i style="width:${Math.max(3,v/max*100)}%"></i></div><b>${num(v)}</b></div>`}).join("")}</div>`:`<div class="empty">Nenhuma produção lançada.</div>`}</div>
    <div class="card"><h3>Como funciona a V3</h3><p>O usuário escolhe a costureira, o tipo e os subserviços daquele tipo. A produção é calculada automaticamente:</p><p><b>Quantidade × Fração do subserviço = Produção fracionada</b></p><div class="note">O código visual 01.1, 02.3 etc. é mantido, mas a relação Tipo → Subserviço fica gravada explicitamente no banco.</div></div>
  </div>`;
}

function lancamento(){
  const d=state.db, tipos=active(d.tipos), cs=active(d.costureiras);
  $("#main").innerHTML=head("Lançar produção","Cadastre vários subserviços de uma vez para a mesma costureira e data.")+
  `<div class="card"><div class="form-grid">
    <label>Costureira<select id="lc"><option value="">Selecione...</option>${cs.map(x=>`<option value="${x.id}">${esc(x.codigo)} - ${esc(x.nome)}</option>`).join("")}</select></label>
    <label>Data<input id="ld" type="date" value="${today()}"></label>
    <label>Tipo<select id="lt"><option value="">Selecione...</option>${tipos.map(x=>`<option value="${x.codigo}">${esc(x.codigo)} - ${esc(x.nome)}</option>`).join("")}</select></label>
    <div></div>
  </div><div id="serviceBox" class="section"><div class="empty">Escolha um tipo para carregar os subserviços.</div></div>
  <div class="toolbar section"><button id="saveProduction" class="primary">Salvar produção</button></div></div>`;
  $("#lt").onchange=loadServices; $("#saveProduction").onclick=saveProduction;
}
function loadServices(){
  const t=$("#lt").value, ss=active(state.db.subservicos).filter(x=>x.tipoCodigo===t).sort((a,b)=>a.ordem-b.ordem);
  $("#serviceBox").innerHTML=ss.length?`<h3>${esc(typeName(t))} · subserviços disponíveis</h3><div class="checklist">${ss.map(s=>`<div class="service-row"><div><b>${esc(s.codigo)} - ${esc(s.nome)}</b><small>Fração: ${money(s.fracaoServico)} · v${s.versao||1}</small></div><input type="number" min="0" step="1" placeholder="Quantidade" data-sub="${s.id}"></div>`).join("")}</div>`:`<div class="empty">Este tipo ainda não possui subserviços.</div>`;
}
async function saveProduction(){
  const c=$("#lc").value,t=$("#lt").value,date=$("#ld").value;
  if(!c||!t||!date)return toast("Preencha costureira, data e tipo.",true);
  const fields=[...document.querySelectorAll("[data-sub]")].filter(x=>Number(x.value)>0);
  if(!fields.length)return toast("Informe pelo menos uma quantidade.",true);
  try{
    for(const f of fields) await api("/api/lancamentos",{method:"POST",body:JSON.stringify({costureiraId:Number(c),tipoCodigo:t,subservicoId:Number(f.dataset.sub),quantidade:Number(f.value),data:date,usuarioLogin:state.user.login})});
    toast(`${fields.length} lançamento(s) salvo(s).`);lancamento();
  }catch(e){toast(e.message,true)}
}


async function relatorios(){
  const d=state.db, cs=active(d.costureiras), ts=active(d.tipos);
  $("#main").innerHTML=head("Relatórios","Visão diária, mensal e por período da produção.")+
  `<div class="card">
    <div class="report-filters">
      <label>Data inicial<input id="rf" type="date" value="${new Date(new Date().getFullYear(),new Date().getMonth(),1).toISOString().slice(0,10)}"></label>
      <label>Data final<input id="rt" type="date" value="${today()}"></label>
      <label>Costureira<select id="rc"><option value="">Todas</option>${cs.map(x=>`<option value="${x.id}">${esc(x.nome)}</option>`).join("")}</select></label>
      <label>Tipo<select id="rty"><option value="">Todos</option>${ts.map(x=>`<option value="${x.codigo}">${esc(x.nome)}</option>`).join("")}</select></label>
      <button class="primary" id="runReport">Atualizar</button>
    </div>
  </div>
  <div id="reportResult" class="section"></div>`;
  $("#rty").onchange=async()=>{await populateReportSub();};
  $("#runReport").onclick=runReport;
  await runReport();
}

async function populateReportSub(){ /* filtro de subserviço fica embutido no relatório; tipo já limita os resultados */ }

async function runReport(){
  try{
    const qs=new URLSearchParams({from:$("#rf").value,to:$("#rt").value,costureiraId:$("#rc").value,tipoCodigo:$("#rty").value});
    const r=await api("/api/relatorios?"+qs.toString());
    drawReport(r);
  }catch(e){toast(e.message,true)}
}
function drawReport(r){
  const t=r.totais;
  const top=r.costureiras[0];
  const max=Math.max(...r.costureiras.map(x=>x.producaoFracionada),1);
  const dayMax=Math.max(...r.diario.map(x=>x.producaoFracionada),1);
  $("#reportResult").innerHTML=
  `<div class="kpi-grid">
    <div class="card stat"><div class="label">Lançamentos</div><div class="value">${t.lancamentos}</div></div>
    <div class="card stat"><div class="label">Quantidade executada</div><div class="value">${num(t.quantidade)}</div></div>
    <div class="card stat"><div class="label">Produção fracionada</div><div class="value">${num(t.producaoFracionada)}</div></div>
    <div class="card stat"><div class="label">1º no ranking</div><div class="value" style="font-size:20px">${top?esc(top.nome):"—"}</div></div>
  </div>
  <div class="grid-2 section">
    <div class="card chart"><h3>Produção por costureira</h3>${r.costureiras.length?`<div class="bar-list">${r.costureiras.map(x=>`<div class="bar-item"><span>${esc(x.nome)}</span><div class="bar"><i style="width:${Math.max(3,x.producaoFracionada/max*100)}%"></i></div><b>${num(x.producaoFracionada)}</b></div>`).join("")}</div>`:`<div class="empty">Sem dados.</div>`}</div>
    <div class="card chart"><h3>Produção por dia</h3>${r.diario.length?`<div class="chart-bars">${r.diario.map(x=>`<div class="chart-col" title="${x.data}: ${num(x.producaoFracionada)}"><b>${num(x.producaoFracionada)}</b><i class="col-bar" style="height:${Math.max(2,x.producaoFracionada/dayMax*170)}px"></i><span>${x.data.slice(5)}</span></div>`).join("")}</div>`:`<div class="empty">Sem dados.</div>`}</div>
  </div>
  <div class="grid-2 section">
    <div class="card"><h3>Por tipo</h3>${reportTable(r.tipos,["codigo","nome","quantidade","producaoFracionada"],["Código","Tipo","Qtd.","Produção"])}</div>
    <div class="card"><h3>Por subserviço</h3>${reportTable(r.subservicos,["codigo","nome","quantidade","producaoFracionada"],["Código","Subserviço","Qtd.","Produção"])}</div>
  </div>
  <div class="card section"><h3>Resumo por costureira</h3>${reportTable(r.costureiras,["codigo","nome","lancamentos","quantidade","producaoFracionada"],["Código","Costureira","Lançamentos","Qtd.","Produção"])}</div>`;
}
function reportTable(rows,keys,labels){
  if(!rows.length)return `<div class="empty">Sem dados no período.</div>`;
  return `<div class="table-wrap"><table><thead><tr>${labels.map(esc).map(x=>`<th>${x}</th>`).join("")}</tr></thead><tbody>${rows.map(r=>`<tr>${keys.map(k=>`<td>${k==="producaoFracionada"?`<b>${num(r[k])}</b>`:k==="quantidade"?num(r[k]):esc(r[k])}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
}

function historico(){
  const rows=[...state.db.lancamentos].sort((a,b)=>b.data.localeCompare(a.data)||b.criadoEm.localeCompare(a.criadoEm));
  $("#main").innerHTML=head("Histórico","Todos os lançamentos registrados.")+
  `<div class="card"><div class="row"><label>De<input id="hf" type="date"></label><label>Até<input id="ht" type="date"></label><label>Costureira<select id="hc"><option value="">Todas</option>${active(state.db.costureiras).map(x=>`<option value="${x.id}">${esc(x.nome)}</option>`).join("")}</select></label><button id="hfilter" class="secondary">Filtrar</button></div><div id="historyTable" class="section"></div></div>`;
  $("#hfilter").onclick=()=>drawHistory(rows);
  drawHistory(rows);
}
function drawHistory(all){
  const f=$("#hf").value,t=$("#ht").value,c=$("#hc").value;
  const rows=all.filter(x=>(!f||x.data>=f)&&(!t||x.data<=t)&&(!c||String(x.costureiraId)===c));
  $("#historyTable").innerHTML=`<div class="table-wrap"><table><thead><tr><th>Data</th><th>Costureira</th><th>Tipo</th><th>Subserviço</th><th>Qtd.</th><th>Fração</th><th>Produção</th><th></th></tr></thead><tbody>${rows.length?rows.map(x=>{let s=sub(x.subservicoId);return `<tr><td>${x.data}</td><td>${esc(costName(x.costureiraId))}</td><td>${esc(typeName(x.tipoCodigo))}</td><td>${esc(s?.codigo)} - ${esc(s?.nome)}</td><td>${num(x.quantidade)}</td><td>${money(x.fracaoUtilizada)}</td><td><b>${num(x.producaoFracionada)}</b></td><td>${state.user.perfil==="admin"?`<button class="danger small" onclick="delLaunch('${x.id}')">Excluir</button>`:""}</td></tr>`}).join(""):`<tr><td colspan="8" class="empty">Nenhum registro.</td></tr>`}</tbody></table></div>`;
}
async function delLaunch(id){if(!confirm("Excluir este lançamento? O histórico da ação ficará registrado."))return;try{await api(`/api/lancamentos/${id}`,{method:"DELETE",body:JSON.stringify({usuarioLogin:state.user.login})});toast("Lançamento excluído.");historico()}catch(e){toast(e.message,true)}}

function costureiras(){
  const rows=active(state.db.costureiras);
  $("#main").innerHTML=head("Costureiras","Cadastro administrativo de costureiras.",`<button class="primary" onclick="showCostForm()">+ Nova costureira</button>`)+
  `<div class="card"><div class="table-wrap"><table><thead><tr><th>Código</th><th>Nome</th><th>Ações</th></tr></thead><tbody>${rows.map(x=>`<tr><td><b>${esc(x.codigo)}</b></td><td>${esc(x.nome)}</td><td><button class="danger" onclick="delCost(${x.id})">Desativar</button></td></tr>`).join("")}</tbody></table></div></div>`;
}
function showCostForm(){const codigo=prompt("Código da costureira:");if(codigo===null)return;const nome=prompt("Nome:");if(!nome)return;api("/api/costureiras",{method:"POST",body:JSON.stringify({codigo,nome})}).then(()=>{toast("Costureira cadastrada.");costureiras()}).catch(e=>toast(e.message,true))}
async function delCost(id){if(!confirm("Desativar esta costureira? Os lançamentos antigos serão preservados."))return;try{await api(`/api/costureiras/${id}`,{method:"DELETE"});toast("Costureira desativada.");costureiras()}catch(e){toast(e.message,true)}}

function tipos(){
  const rows=active(state.db.tipos);
  $("#main").innerHTML=head("Tipos de serviço","Crie novos tipos sem alterar o código do sistema.",`<button class="primary" onclick="showTypeForm()">+ Novo tipo</button>`)+
  `<div class="card"><div class="table-wrap"><table><thead><tr><th>Código</th><th>Tipo</th><th>Subserviços ativos</th><th>Ações</th></tr></thead><tbody>${rows.map(x=>`<tr><td><b>${esc(x.codigo)}</b></td><td>${esc(x.nome)}</td><td>${active(state.db.subservicos).filter(s=>s.tipoCodigo===x.codigo).length}</td><td><button class="danger" onclick="delType('${x.codigo}')">Desativar</button></td></tr>`).join("")}</tbody></table></div></div>`;
}
function showTypeForm(){const codigo=prompt("Código do novo tipo (ex.: 04):");if(codigo===null)return;const nome=prompt("Nome do tipo:");if(!nome)return;api("/api/tipos",{method:"POST",body:JSON.stringify({codigo,nome})}).then(()=>{toast("Tipo cadastrado.");tipos()}).catch(e=>toast(e.message,true))}
async function delType(codigo){if(!confirm("Desativar o tipo e seus subserviços? O histórico será preservado."))return;try{await api(`/api/tipos/${encodeURIComponent(codigo)}`,{method:"DELETE"});toast("Tipo desativado.");tipos()}catch(e){toast(e.message,true)}}

function subservicos(){
  const tipos=active(state.db.tipos), ss=active(state.db.subservicos).sort((a,b)=>a.tipoCodigo.localeCompare(b.tipoCodigo)||a.ordem-b.ordem);
  $("#main").innerHTML=head("Subserviços","Cadastre e mantenha frações por tipo. Alterações de fração aumentam a versão do cadastro.",`<button class="primary" onclick="showSubForm()">+ Novo subserviço</button>`)+
  `<div class="card"><div class="table-wrap"><table><thead><tr><th>Código</th><th>Tipo</th><th>Subserviço</th><th>Fração</th><th>Versão</th><th>Ações</th></tr></thead><tbody>${ss.map(x=>`<tr><td><b>${esc(x.codigo)}</b></td><td>${esc(typeName(x.tipoCodigo))}</td><td>${esc(x.nome)}</td><td>${money(x.fracaoServico)}</td><td>v${x.versao||1}</td><td class="actions"><button class="secondary" onclick="editSub(${x.id})">Editar</button><button class="danger" onclick="delSub(${x.id})">Desativar</button></td></tr>`).join("")}</tbody></table></div></div>`;
}
function showSubForm(){
  const tipos=active(state.db.tipos);
  const tipo=prompt("Código do tipo ("+tipos.map(x=>x.codigo+"="+x.nome).join(", ")+"):");if(!tipo)return;
  const nome=prompt("Nome do subserviço:");if(!nome)return;
  const fr=prompt("Fração do serviço (ex.: 0.11):");if(fr===null)return;
  const ord=prompt("Número do subserviço (deixe vazio para o próximo):","");
  api("/api/subservicos",{method:"POST",body:JSON.stringify({tipoCodigo:tipo,nome,fracaoServico:Number(fr),ordem:Number(ord)||0})}).then(()=>{toast("Subserviço cadastrado.");subservicos()}).catch(e=>toast(e.message,true))
}
function editSub(id){
  const s=sub(id);if(!s)return;
  const nome=prompt("Nome:",s.nome);if(nome===null)return;
  const fr=prompt("Nova fração:",String(s.fracaoServico));if(fr===null)return;
  api(`/api/subservicos/${id}`,{method:"PUT",body:JSON.stringify({nome,fracaoServico:Number(fr)})}).then(()=>{toast("Subserviço atualizado.");subservicos()}).catch(e=>toast(e.message,true))
}
async function delSub(id){if(!confirm("Desativar este subserviço? Lançamentos antigos continuarão no histórico."))return;try{await api(`/api/subservicos/${id}`,{method:"DELETE"});toast("Subserviço desativado.");subservicos()}catch(e){toast(e.message,true)}}

function backup(){
  $("#main").innerHTML=head("Backup e exportação","O JSON preserva a estrutura completa; o CSV é prático para Excel.")+
  `<div class="grid-2">
    <div class="card"><h3>💾 Backup completo</h3><p>Inclui usuários, costureiras, tipos, subserviços, lançamentos e histórico.</p><button class="primary" onclick="download('/api/backup/json','backup_confeccao.json')">Baixar JSON</button></div>
    <div class="card"><h3>📊 Produção em CSV</h3><p>Arquivo compatível com Excel/LibreOffice para análise.</p><div class="row"><label>De<input id="bf" type="date"></label><label>Até<input id="bt" type="date"></label></div><button class="primary" onclick="downloadCSV()">Baixar CSV</button></div>
  </div>
  <div class="card section"><h3>Estrutura da V3</h3><p><b>Usuários → Costureiras → Tipos → Subserviços → Produção → Relatórios → Backup</b></p><div class="note">A exclusão de cadastros é lógica (desativação), preservando o histórico. O código 01.1 é visual e identificador; a relação com o tipo fica gravada no campo <b>tipoCodigo</b>.</div></div>`;
}
function download(url,name){fetch(url).then(r=>r.blob()).then(b=>{const a=document.createElement("a");a.href=URL.createObjectURL(b);a.download=name;a.click();URL.revokeObjectURL(a.href)})}
function downloadCSV(){const f=$("#bf").value,t=$("#bt").value;download(`/api/backup/csv?from=${encodeURIComponent(f)}&to=${encodeURIComponent(t)}`,`producao_${f||"inicio"}_${t||"fim"}.csv`)}

window.delLaunch=delLaunch;window.delCost=delCost;window.delType=delType;window.delSub=delSub;window.showCostForm=showCostForm;window.showTypeForm=showTypeForm;window.showSubForm=showSubForm;window.editSub=editSub;window.download=download;window.downloadCSV=downloadCSV;
