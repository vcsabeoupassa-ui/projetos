const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
const DB_FILE = path.join(ROOT, "database", "banco.json");
const PUBLIC = path.join(ROOT, "public");

function readDB() {
  return JSON.parse(fs.readFileSync(DB_FILE, "utf8"));
}
function writeDB(db) {
  const tmp = DB_FILE + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2), "utf8");
  fs.renameSync(tmp, DB_FILE);
}
function send(res, status, data, type="application/json; charset=utf-8") {
  res.writeHead(status, {"Content-Type": type, "Cache-Control":"no-store"});
  res.end(type.startsWith("application/json") ? JSON.stringify(data) : data);
}
function body(req) {
  return new Promise((resolve,reject)=>{
    let raw="";
    req.on("data", c => { raw += c; if(raw.length > 2e6) req.destroy(); });
    req.on("end", ()=>{ try { resolve(raw ? JSON.parse(raw) : {}); } catch(e){ reject(e); }});
    req.on("error", reject);
  });
}
function id() { return crypto.randomUUID(); }
function today() { return new Date().toISOString().slice(0,10); }
function findActive(arr, key, val) { return arr.find(x => String(x[key]) === String(val) && x.ativo !== false); }

function csvEscape(v) {
  const s = String(v ?? "");
  return '"' + s.replaceAll('"','""') + '"';
}
function makeCSV(db, from, to) {
  const rows = db.lancamentos.filter(x => (!from || x.data >= from) && (!to || x.data <= to));
  const head = ["Data","Costureira","Código Costureira","Tipo","Subserviço","Código","Quantidade","Fração","Produção Fracionada","Usuário","Criado em"];
  const out = [head.map(csvEscape).join(";")];
  for (const r of rows) {
    const c = db.costureiras.find(x=>x.id===r.costureiraId);
    const t = db.tipos.find(x=>x.codigo===r.tipoCodigo);
    const s = db.subservicos.find(x=>x.id===r.subservicoId);
    out.push([r.data,c?.nome,c?.codigo,t?.nome,s?.nome,s?.codigo,r.quantidade,r.fracaoUtilizada,r.producaoFracionada,r.usuarioLogin,r.criadoEm].map(csvEscape).join(";"));
  }
  return "\ufeff" + out.join("\r\n");
}

async function api(req,res,url) {
  const db = readDB();
  const parts = url.pathname.split("/").filter(Boolean);
  const method = req.method;

  if (url.pathname === "/api/login" && method === "POST") {
    const b = await body(req);
    const u = db.usuarios.find(x => x.login === b.login && x.senha === b.senha && x.ativo !== false);
    if (!u) return send(res,401,{erro:"Login ou senha inválidos."});
    return send(res,200,{id:u.id,login:u.login,nome:u.nome,perfil:u.perfil});
  }

  if (url.pathname === "/api/dados" && method === "GET") {
    return send(res,200,db);
  }

  if (url.pathname === "/api/lancamentos" && method === "POST") {
    const b = await body(req);
    const c = findActive(db.costureiras,"id",b.costureiraId);
    const t = findActive(db.tipos,"codigo",b.tipoCodigo);
    const s = db.subservicos.find(x=>x.id===Number(b.subservicoId) && x.ativo!==false && x.tipoCodigo===String(b.tipoCodigo));
    const q = Number(b.quantidade);
    if (!c || !t || !s || !(q>0)) return send(res,400,{erro:"Dados do lançamento inválidos."});
    const item = {
      id:id(), data:b.data || today(), costureiraId:c.id, tipoCodigo:t.codigo, subservicoId:s.id,
      quantidade:q, fracaoUtilizada:Number(s.fracaoServico), producaoFracionada:q*Number(s.fracaoServico),
      usuarioLogin:b.usuarioLogin || "usuario", criadoEm:new Date().toISOString()
    };
    db.lancamentos.push(item);
    db.historico.push({id:id(),acao:"CRIAR_LANCAMENTO",registroId:item.id,usuario:item.usuarioLogin,dataHora:item.criadoEm});
    writeDB(db);
    return send(res,201,item);
  }

  if (parts[0]==="api" && parts[1]==="lancamentos" && parts[2] && method==="DELETE") {
    const ix=db.lancamentos.findIndex(x=>x.id===parts[2]);
    if(ix<0) return send(res,404,{erro:"Lançamento não encontrado."});
    const b=await body(req).catch(()=>({}));
    const [removed]=db.lancamentos.splice(ix,1);
    db.historico.push({id:id(),acao:"EXCLUIR_LANCAMENTO",registroId:removed.id,usuario:b.usuarioLogin||"admin",dataHora:new Date().toISOString()});
    writeDB(db);
    return send(res,200,{ok:true});
  }

  if (url.pathname === "/api/costureiras" && method === "POST") {
    const b=await body(req);
    if(!b.codigo || !b.nome) return send(res,400,{erro:"Código e nome são obrigatórios."});
    if(db.costureiras.some(x=>x.codigo===String(b.codigo))) return send(res,409,{erro:"Código de costureira já existe."});
    const item={id:Date.now(),codigo:String(b.codigo),nome:String(b.nome).trim(),ativo:true};
    db.costureiras.push(item); writeDB(db); return send(res,201,item);
  }
  if (parts[0]==="api" && parts[1]==="costureiras" && parts[2] && method==="DELETE") {
    const x=db.costureiras.find(y=>y.id===Number(parts[2]));
    if(!x) return send(res,404,{erro:"Costureira não encontrada."});
    x.ativo=false; writeDB(db); return send(res,200,{ok:true});
  }

  if (url.pathname === "/api/tipos" && method === "POST") {
    const b=await body(req);
    if(!b.codigo || !b.nome) return send(res,400,{erro:"Código e nome são obrigatórios."});
    if(db.tipos.some(x=>x.codigo===String(b.codigo))) return send(res,409,{erro:"Código de tipo já existe."});
    const item={id:Date.now(),codigo:String(b.codigo),nome:String(b.nome).trim(),ativo:true};
    db.tipos.push(item); writeDB(db); return send(res,201,item);
  }
  if (parts[0]==="api" && parts[1]==="tipos" && parts[2] && method==="DELETE") {
    const x=db.tipos.find(y=>y.id===Number(parts[2]));
    if(!x) return send(res,404,{erro:"Tipo não encontrado."});
    x.ativo=false; db.subservicos.filter(s=>s.tipoCodigo===x.codigo).forEach(s=>s.ativo=false);
    writeDB(db); return send(res,200,{ok:true});
  }

  if (url.pathname === "/api/subservicos" && method === "POST") {
    const b=await body(req);
    const tipo=findActive(db.tipos,"codigo",b.tipoCodigo);
    if(!tipo || !b.nome || !(Number(b.fracaoServico)>=0)) return send(res,400,{erro:"Tipo, nome e fração são obrigatórios."});
    const ordem = Number(b.ordem) || (Math.max(0,...db.subservicos.filter(s=>s.tipoCodigo===tipo.codigo).map(s=>s.ordem))+1);
    const codigo=`${tipo.codigo}.${ordem}`;
    if(db.subservicos.some(x=>x.codigo===codigo && x.ativo!==false)) return send(res,409,{erro:"Esse subserviço já existe."});
    const item={id:Date.now(),codigo,tipoCodigo:tipo.codigo,ordem,nome:String(b.nome).trim(),fracaoServico:Number(b.fracaoServico),ativo:true,versao:1};
    db.subservicos.push(item); writeDB(db); return send(res,201,item);
  }
  if (parts[0]==="api" && parts[1]==="subservicos" && parts[2] && method==="DELETE") {
    const x=db.subservicos.find(y=>y.id===Number(parts[2]));
    if(!x) return send(res,404,{erro:"Subserviço não encontrado."});
    x.ativo=false; writeDB(db); return send(res,200,{ok:true});
  }
  if (parts[0]==="api" && parts[1]==="subservicos" && parts[2] && method==="PUT") {
    const x=db.subservicos.find(y=>y.id===Number(parts[2]));
    if(!x) return send(res,404,{erro:"Subserviço não encontrado."});
    const b=await body(req);
    const nova=Number(b.fracaoServico);
    if(!(nova>=0) || !b.nome) return send(res,400,{erro:"Nome e fração válidos são obrigatórios."});
    if(nova !== Number(x.fracaoServico)) {
      const old={...x};
      x.fracaoServico=nova; x.nome=String(b.nome).trim(); x.versao=(x.versao||1)+1;
      db.historico.push({id:id(),acao:"ALTERAR_SUBSERVICO",registroId:x.id,versaoAnterior:old,versaoNova:{...x},dataHora:new Date().toISOString()});
    } else x.nome=String(b.nome).trim();
    writeDB(db); return send(res,200,x);
  }


  if (url.pathname === "/api/relatorios" && method === "GET") {
    const from = url.searchParams.get("from") || "";
    const to = url.searchParams.get("to") || "";
    const costureiraId = url.searchParams.get("costureiraId") || "";
    const tipoCodigo = url.searchParams.get("tipoCodigo") || "";
    const subservicoId = url.searchParams.get("subservicoId") || "";

    const rows = db.lancamentos.filter(x =>
      (!from || x.data >= from) &&
      (!to || x.data <= to) &&
      (!costureiraId || String(x.costureiraId) === String(costureiraId)) &&
      (!tipoCodigo || x.tipoCodigo === tipoCodigo) &&
      (!subservicoId || String(x.subservicoId) === String(subservicoId))
    );

    const sum = a => a.reduce((n,x)=>n+Number(x),0);
    const by = (keyFn) => {
      const m = {};
      rows.forEach(x => {
        const k = keyFn(x);
        if (!m[k]) m[k] = {quantidade:0, producaoFracionada:0, lancamentos:0};
        m[k].quantidade += Number(x.quantidade);
        m[k].producaoFracionada += Number(x.producaoFracionada);
        m[k].lancamentos += 1;
      });
      return m;
    };

    const costMap = by(x => String(x.costureiraId));
    const typeMap = by(x => x.tipoCodigo);
    const subMap = by(x => String(x.subservicoId));
    const dailyMap = by(x => x.data);

    const costureiras = Object.entries(costMap).map(([id,v]) => {
      const c = db.costureiras.find(x=>String(x.id)===id);
      return {id:Number(id), codigo:c?.codigo||"", nome:c?.nome||"Inativo", ...v};
    }).sort((a,b)=>b.producaoFracionada-a.producaoFracionada);

    const tipos = Object.entries(typeMap).map(([codigo,v]) => {
      const t=db.tipos.find(x=>x.codigo===codigo);
      return {codigo, nome:t?.nome||codigo, ...v};
    }).sort((a,b)=>b.producaoFracionada-a.producaoFracionada);

    const subservicos = Object.entries(subMap).map(([id,v]) => {
      const s=db.subservicos.find(x=>String(x.id)===id);
      return {id:Number(id), codigo:s?.codigo||"", nome:s?.nome||"Inativo", tipoCodigo:s?.tipoCodigo||"", ...v};
    }).sort((a,b)=>b.producaoFracionada-a.producaoFracionada);

    const diario = Object.entries(dailyMap).map(([data,v])=>({data,...v}))
      .sort((a,b)=>a.data.localeCompare(b.data));

    return send(res,200,{
      filtros:{from,to,costureiraId,tipoCodigo,subservicoId},
      totais:{
        lancamentos:rows.length,
        quantidade:sum(rows.map(x=>x.quantidade)),
        producaoFracionada:sum(rows.map(x=>x.producaoFracionada))
      },
      costureiras, tipos, subservicos, diario
    });
  }

  if (url.pathname === "/api/backup/json" && method === "GET") {
    return send(res,200,db,"application/json; charset=utf-8");
  }
  if (url.pathname === "/api/backup/csv" && method === "GET") {
    return send(res,200,makeCSV(db,url.searchParams.get("from"),url.searchParams.get("to")),"text/csv; charset=utf-8");
  }

  return send(res,404,{erro:"Rota não encontrada."});
}

const mime={".html":"text/html; charset=utf-8",".css":"text/css; charset=utf-8",".js":"text/javascript; charset=utf-8",".json":"application/json; charset=utf-8"};
const server=http.createServer(async(req,res)=>{
  try{
    const url=new URL(req.url,`http://${req.headers.host||"localhost"}`);
    if(url.pathname.startsWith("/api/")) return await api(req,res,url);
    let file=url.pathname==="/" ? "/index.html" : url.pathname;
    const fp=path.normalize(path.join(PUBLIC,file));
    if(!fp.startsWith(PUBLIC)) return send(res,403,{erro:"Acesso negado."});
    if(!fs.existsSync(fp) || fs.statSync(fp).isDirectory()) return send(res,404,{erro:"Arquivo não encontrado."});
    res.writeHead(200,{"Content-Type":mime[path.extname(fp)]||"application/octet-stream"});
    fs.createReadStream(fp).pipe(res);
  }catch(e){ console.error(e); send(res,500,{erro:"Erro interno do servidor."}); }
});
server.listen(PORT,()=>console.log(`Sistema V3.1 rodando em http://localhost:${PORT}`));
