/**
 * Cofre do Personal Planner no Google Drive.
 *
 * Fica num projeto em script.google.com, na SUA conta Google, publicado como
 * "App da Web". Guarda os dados do planner num arquivo do seu Drive.
 * A senha NAO fica aqui: a primeira senha que o app mandar vira a senha do
 * cofre, e depois disso so quem mandar a mesma senha entra. Nada fica no GitHub.
 *
 * Calendario do iPhone (08/11): o mesmo endereco, com ?cal=<codigo>, devolve
 * um calendario (.ics) com as contas, compromissos e tarefas da casa. O codigo
 * e criado aqui na primeira vez e entregue so para quem tem a senha.
 */
const ARQUIVO = "planner-pessoal-dados.json";

function doPost(e) {
  let pedido = {};
  try { pedido = JSON.parse(e.postData.contents || "{}"); } catch (err) { return resposta({ ok: false, motivo: "pedido inválido" }); }
  const props = PropertiesService.getScriptProperties();
  const guardada = props.getProperty("SENHA");
  if (!pedido.senha || String(pedido.senha).length < 4) return resposta({ ok: false, motivo: "senha muito curta" });
  if (!guardada) props.setProperty("SENHA", String(pedido.senha));
  else if (pedido.senha !== guardada) return resposta({ ok: false, motivo: "senha errada" });
  const ics = codigoCalendario(props);

  const trava = LockService.getScriptLock();
  trava.waitLock(20000);
  try {
    const arq = arquivo();
    const atual = JSON.parse(arq.getBlob().getDataAsString() || "{}");
    if (pedido.acao === "ler") return resposta({ ok: true, dados: atual.versao ? atual : null, ics: ics });
    if (pedido.acao === "gravar") {
      // outro aparelho gravou depois que este leu: devolve o atual para juntar
      if (atual.salvoEm && pedido.base && atual.salvoEm > pedido.base) return resposta({ ok: false, conflito: true, dados: atual, ics: ics });
      arq.setContent(JSON.stringify(pedido.dados));
      return resposta({ ok: true, salvoEm: pedido.dados.salvoEm, ics: ics });
    }
    return resposta({ ok: false, motivo: "ação desconhecida" });
  } finally {
    trava.releaseLock();
  }
}

/* calendario assinado pelo iPhone: so com o codigo certo */
function doGet(e) {
  const props = PropertiesService.getScriptProperties();
  const codigo = props.getProperty("ICS");
  if (!codigo || !e || !e.parameter || e.parameter.cal !== codigo) return ContentService.createTextOutput("sem acesso");
  const atual = JSON.parse(arquivo().getBlob().getDataAsString() || "{}");
  return ContentService.createTextOutput(montarIcs(atual.agendaCal || [])).setMimeType(ContentService.MimeType.ICAL);
}

function codigoCalendario(props) {
  let c = props.getProperty("ICS");
  if (!c) { c = (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, "").slice(0, 40); props.setProperty("ICS", c); }
  return c;
}

function montarIcs(evs) {
  const txt = t => String(t || "").replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
  const d8 = s => s.replace(/-/g, "");
  const diaSeguinte = s => { const d = new Date(s + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + 1); return d.toISOString().slice(0, 10).replace(/-/g, ""); };
  const agora = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");
  const L = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Personal Planner//PT-BR", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
             "X-WR-CALNAME:Personal Planner", "X-WR-TIMEZONE:America/Sao_Paulo", "REFRESH-INTERVAL;VALUE=DURATION:PT1H", "X-PUBLISHED-TTL:PT1H"];
  evs.forEach(function (e) {
    L.push("BEGIN:VEVENT", "UID:" + e.id + "@personal-planner", "DTSTAMP:" + agora, "SUMMARY:" + txt(e.t));
    if (e.h) {
      const p = e.h.split(":"), fim = String(Math.min(23, Number(p[0]) + 1)).padStart(2, "0") + p[1];
      L.push("DTSTART:" + d8(e.d) + "T" + p[0] + p[1] + "00", "DTEND:" + d8(e.d) + "T" + fim + "00");
    } else {
      L.push("DTSTART;VALUE=DATE:" + d8(e.d), "DTEND;VALUE=DATE:" + diaSeguinte(e.d));
    }
    if (e.k === "fin" || e.k === "comp") L.push("BEGIN:VALARM", "ACTION:DISPLAY", "DESCRIPTION:" + txt(e.t), e.h ? "TRIGGER:-PT1H" : "TRIGGER:PT9H", "END:VALARM");
    L.push("END:VEVENT");
  });
  L.push("END:VCALENDAR");
  return L.map(dobrar).join("\r\n") + "\r\n";
}

/* linhas longas do .ics quebram em pedacos que comecam com espaco */
function dobrar(l) {
  const out = [];
  while (l.length > 60) { out.push(l.slice(0, 60)); l = " " + l.slice(60); }
  out.push(l);
  return out.join("\r\n");
}

function arquivo() {
  const it = DriveApp.getFilesByName(ARQUIVO);
  return it.hasNext() ? it.next() : DriveApp.createFile(ARQUIVO, "{}", "application/json");
}

function resposta(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
