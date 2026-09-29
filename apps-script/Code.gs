/**
 * CRM das Landing Pages — Google Apps Script vinculado à planilha.
 *
 * 1. Recebe os acessos e os leads enviados pelas LPs (doPost) e grava nas abas "Acessos" e "Leads".
 * 2. Monta a planilha inteira: CRM com status, aba de LPs e o Dashboard
 *    (menu "CRM LPs → Configurar / reparar planilha", ou rode a função setup).
 * 3. Carimba "Atualizado em" sempre que alguém mexe nos campos de CRM de um lead.
 *
 * Instalação passo a passo: README.md do repositório.
 */

const TZ = 'America/Sao_Paulo';
const ABA = { DASH: 'Dashboard', LEADS: 'Leads', ACESSOS: 'Acessos', LPS: 'LPs' };
const STATUS = ['Contato', 'Resgatar', 'Agendado', 'Falhou', 'Concluído'];

// Status: fundo claro + texto escuro nas células; cor cheia no gráfico.
const COR_STATUS = {
  'Contato':   { fundo: '#dcebfb', texto: '#184f95', grafico: '#2a78d6' },
  'Resgatar':  { fundo: '#fdefc8', texto: '#6b4a00', grafico: '#eda100' },
  'Agendado':  { fundo: '#e6e2f7', texto: '#3b2e8a', grafico: '#4a3aa7' },
  'Falhou':    { fundo: '#fbe0e0', texto: '#a12f2f', grafico: '#e34948' },
  'Concluído': { fundo: '#d9f0d9', texto: '#005c00', grafico: '#008300' },
};
// Ordem das barras empilhadas: validada para daltonismo (cores vizinhas bem distintas).
const ORDEM_GRAFICO_STATUS = ['Concluído', 'Agendado', 'Contato', 'Resgatar', 'Falhou'];
// Uma cor fixa por LP, na ordem da aba LPs (máximo 8 LPs no dashboard).
const CORES_LPS = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#4a3aa7', '#e34948'];

const LPS_INICIAIS = [
  ['limpeza-de-pele', 'Limpeza de Pele', 'Limpeza de pele profunda — R$ 139'],
  ['depilacao-laser', 'Depilação a Laser', 'Pacote 5 sessões (área pequena) — R$ 290'],
  ['harmonizacao-facial', 'Harmonização Facial', 'Avaliação cortesia'],
  ['drenagem-linfatica', 'Drenagem Linfática', 'Pacote 4 sessões — R$ 299'],
  ['tratamento-manchas', 'Tratamento de Manchas', 'Avaliação + peeling — R$ 197'],
];

const DATA_HORA = 'dd/mm/yyyy hh:mm';
const REAIS = '"R$ "#,##0.00';
const REAIS_INTEIRO = '"R$ "#,##0';

// Paleta do dashboard
const FUNDO = '#f6f5f2';
const CARTAO = '#ffffff';
const TINTA = '#0b0b0b';
const TINTA_2 = '#52514e';
const APAGADO = '#898781';
const LINHA = '#e1e0d9';

// grupo define a cor do cabeçalho: dados do lead | trabalho da equipe | rastreamento
const COLS_LEADS = [
  { nome: 'ID', larg: 70, grupo: 'lead' },
  { nome: 'Entrada', larg: 125, grupo: 'lead', formato: DATA_HORA },
  { nome: 'LP', larg: 150, grupo: 'lead' },
  { nome: 'Nome', larg: 170, grupo: 'lead' },
  { nome: 'WhatsApp', larg: 130, grupo: 'lead', formato: '@' },
  { nome: 'E-mail', larg: 190, grupo: 'lead' },
  { nome: 'Melhor horário', larg: 115, grupo: 'lead' },
  { nome: 'Status', larg: 105, grupo: 'crm' },
  { nome: 'Responsável', larg: 115, grupo: 'crm' },
  { nome: 'Agendado para', larg: 125, grupo: 'crm', formato: DATA_HORA },
  { nome: 'Valor (R$)', larg: 95, grupo: 'crm', formato: REAIS },
  { nome: 'Observações', larg: 260, grupo: 'crm' },
  { nome: 'Atualizado em', larg: 125, grupo: 'crm', formato: DATA_HORA },
  { nome: 'Repetido', larg: 85, grupo: 'origem' },
  { nome: 'Origem', larg: 100, grupo: 'origem' },
  { nome: 'Mídia', larg: 90, grupo: 'origem' },
  { nome: 'Campanha', larg: 140, grupo: 'origem' },
  { nome: 'Conteúdo', larg: 120, grupo: 'origem' },
  { nome: 'Termo', larg: 110, grupo: 'origem' },
  { nome: 'Click ID', larg: 110, grupo: 'origem' },
  { nome: 'Referência', larg: 170, grupo: 'origem' },
  { nome: 'Página', larg: 200, grupo: 'origem' },
  { nome: 'Dispositivo', larg: 95, grupo: 'origem' },
  { nome: 'Visitante', larg: 110, grupo: 'origem' },
  { nome: 'Consentimento', larg: 110, grupo: 'origem' },
];
const COLS_ACESSOS = [
  { nome: 'Data', larg: 125, formato: DATA_HORA },
  { nome: 'LP', larg: 150 },
  { nome: 'Visitante', larg: 110 },
  { nome: 'Origem', larg: 100 },
  { nome: 'Mídia', larg: 90 },
  { nome: 'Campanha', larg: 140 },
  { nome: 'Dispositivo', larg: 95 },
  { nome: 'Referência', larg: 220 },
];
const COLS_LPS = [
  { nome: 'ID', larg: 170, formato: '@' },
  { nome: 'Nome', larg: 180 },
  { nome: 'Oferta', larg: 260 },
  { nome: 'Link', larg: 260 },
  { nome: 'Investimento (R$)', larg: 140, formato: REAIS },
  { nome: 'Observações', larg: 240 },
];

const L = indices_(COLS_LEADS); // L['Status'] → número da coluna (A = 1)
const A = indices_(COLS_ACESSOS);

/* ======================================================================
 * Recebimento dos dados das landing pages
 * ==================================================================== */

function doPost(e) {
  const p = (e && e.parameter) || {};
  try {
    if (p.empresa) return resposta_({ ok: true }); // armadilha para robôs: finge sucesso
    if (!p.lp) return resposta_({ ok: false, erro: 'lp ausente' });
    if (p.tipo === 'acesso') {
      gravaAcesso_(p);
      return resposta_({ ok: true });
    }
    if (p.tipo === 'lead') return resposta_({ ok: true, id: gravaLead_(p) });
    return resposta_({ ok: false, erro: 'tipo inválido' });
  } catch (err) {
    console.error(err);
    return resposta_({ ok: false, erro: String(err && err.message || err) });
  }
}

// Abrir a URL do App da Web no navegador mostra este JSON: serve para conferir a publicação.
function doGet() {
  return resposta_({ ok: true, servico: 'CRM das landing pages' });
}

function resposta_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function gravaLead_(p) {
  const nome = texto_(p.nome, 120);
  const fone = formataFone_(p.whatsapp);
  if (!nome || !fone) throw new Error('nome e WhatsApp são obrigatórios');

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const aba = abaObrigatoria_(ABA.LEADS);
    const props = PropertiesService.getScriptProperties();
    const seq = Number(props.getProperty('SEQ_LEAD') || 0) + 1;
    props.setProperty('SEQ_LEAD', String(seq));
    const id = 'L-' + String(seq).padStart(4, '0');

    const linha = new Array(COLS_LEADS.length).fill('');
    const poe = (coluna, valor) => { linha[L[coluna] - 1] = valor; };
    poe('ID', id);
    poe('Entrada', new Date());
    poe('LP', texto_(p.lp, 80));
    poe('Nome', nome);
    poe('WhatsApp', fone);
    poe('E-mail', texto_(p.email, 120));
    poe('Melhor horário', texto_(p.horario, 40));
    poe('Status', STATUS[0]);
    poe('Repetido', buscaRepetido_(aba, fone));
    poe('Origem', origem_(p));
    poe('Mídia', texto_(p.utm_medium, 60));
    poe('Campanha', texto_(p.utm_campaign, 120));
    poe('Conteúdo', texto_(p.utm_content, 120));
    poe('Termo', texto_(p.utm_term, 120));
    poe('Click ID', texto_(p.click_id, 200));
    poe('Referência', texto_(p.referencia, 300));
    poe('Página', texto_(p.pagina, 300));
    poe('Dispositivo', texto_(p.dispositivo, 20));
    poe('Visitante', texto_(p.visitante, 40));
    poe('Consentimento', p.consentimento === 'Sim' ? 'Sim' : 'Não');
    aba.appendRow(linha);

    // WhatsApp clicável: abre a conversa direto no wa.me
    const r = aba.getLastRow();
    if (aba.getRange(r, L['ID']).getValue() === id) {
      aba.getRange(r, L['WhatsApp']).setRichTextValue(
        SpreadsheetApp.newRichTextValue()
          .setText(fone)
          .setLinkUrl('https://wa.me/55' + fone.replace(/\D/g, ''))
          .build());
    }
    return id;
  } finally {
    lock.releaseLock();
  }
}

function gravaAcesso_(p) {
  const linha = new Array(COLS_ACESSOS.length).fill('');
  const poe = (coluna, valor) => { linha[A[coluna] - 1] = valor; };
  poe('Data', new Date());
  poe('LP', texto_(p.lp, 80));
  poe('Visitante', texto_(p.visitante, 40));
  poe('Origem', origem_(p));
  poe('Mídia', texto_(p.utm_medium, 60));
  poe('Campanha', texto_(p.utm_campaign, 120));
  poe('Dispositivo', texto_(p.dispositivo, 20));
  poe('Referência', texto_(p.referencia, 300));
  abaObrigatoria_(ABA.ACESSOS).appendRow(linha); // appendRow é atômico: dispensa lock
}

// ID do lead anterior com o mesmo WhatsApp (ou vazio).
function buscaRepetido_(aba, fone) {
  const ultima = aba.getLastRow();
  if (ultima < 2) return '';
  const achados = aba.getRange(2, L['WhatsApp'], ultima - 1, 1)
    .createTextFinder(fone).matchEntireCell(true).findAll();
  if (!achados.length) return '';
  return aba.getRange(achados[achados.length - 1].getRow(), L['ID']).getDisplayValue();
}

// utm_source > click id > site de origem > "direto"
function origem_(p) {
  if (p.utm_source) return texto_(p.utm_source, 60).toLowerCase();
  const click = String(p.click_id || '');
  if (click.indexOf('gclid:') === 0) return 'google';
  if (click.indexOf('fbclid:') === 0) return 'meta';
  const m = String(p.referencia || '').match(/^https?:\/\/([^\/?#:]+)/i);
  if (!m) return 'direto';
  const host = m[1].toLowerCase().replace(/^(www|m|l|lm)\./, '');
  const conhecidos = [
    [/(^|\.)google\./, 'google'],
    [/(^|\.)instagram\.com$/, 'instagram'],
    [/(^|\.)(facebook\.com|fb\.com|fb\.me)$/, 'facebook'],
    [/(^|\.)tiktok\.com$/, 'tiktok'],
    [/(^|\.)(youtube\.com|youtu\.be)$/, 'youtube'],
    [/(^|\.)bing\.com$/, 'bing'],
    [/(^|\.)(whatsapp\.com|wa\.me)$/, 'whatsapp'],
    [/^t\.co$/, 'twitter'],
  ];
  for (let i = 0; i < conhecidos.length; i++) {
    if (conhecidos[i][0].test(host)) return conhecidos[i][1];
  }
  return host;
}

function texto_(valor, max) {
  let s = String(valor == null ? '' : valor).replace(/[\r\n\t]+/g, ' ').trim().slice(0, max || 200);
  if (/^[=+\-@]/.test(s)) s = "'" + s; // impede que o texto vire fórmula na planilha
  return s;
}

function formataFone_(valor) {
  let d = String(valor || '').replace(/\D/g, '');
  if (d.length > 11 && d.indexOf('55') === 0) d = d.slice(2);
  if (d.length === 11) return '(' + d.slice(0, 2) + ') ' + d.slice(2, 7) + '-' + d.slice(7);
  if (d.length === 10) return '(' + d.slice(0, 2) + ') ' + d.slice(2, 6) + '-' + d.slice(6);
  return '';
}

/* ======================================================================
 * Gatilhos simples e menu
 * ==================================================================== */

function onOpen() {
  SpreadsheetApp.getUi().createMenu('CRM LPs')
    .addItem('Configurar / reparar planilha', 'setup')
    .addItem('Atualizar dashboard (após mudar a aba LPs)', 'atualizarDashboard')
    .addSeparator()
    .addItem('Inserir lead e acesso de teste', 'testeLead')
    .addToUi();
}

// Qualquer edição nos campos de CRM (Status até Observações) atualiza "Atualizado em".
function onEdit(e) {
  if (!e || !e.range) return;
  const r = e.range;
  const aba = r.getSheet();
  if (aba.getName() !== ABA.LEADS || r.getLastRow() < 2) return;
  if (r.getLastColumn() < L['Status'] || r.getColumn() > L['Observações']) return;
  const inicio = Math.max(r.getRow(), 2);
  aba.getRange(inicio, L['Atualizado em'], r.getLastRow() - inicio + 1, 1).setValue(new Date());
}

function atualizarDashboard() {
  const ss = planilha_();
  montaDashboard_(ss);
  avisa_(ss, 'Dashboard atualizado.');
}

function testeLead() {
  const ss = planilha_();
  const lp = (lpsCadastradas_(ss)[0] || {}).id || 'teste';
  const comum = { lp: lp, visitante: 'teste', dispositivo: 'Computador', utm_source: 'teste', utm_medium: 'manual', utm_campaign: 'teste-setup' };
  doPost({ parameter: Object.assign({ tipo: 'acesso' }, comum) });
  const r = doPost({ parameter: Object.assign({
    tipo: 'lead', nome: 'Lead de Teste', whatsapp: '11999990000', email: 'teste@exemplo.com', horario: 'Tarde', consentimento: 'Sim',
  }, comum) });
  avisa_(ss, 'Resposta: ' + r.getContent() + ' — confira as abas Leads e Acessos e depois apague as linhas de teste.');
}

/* ======================================================================
 * Montagem da planilha
 * ==================================================================== */

function setup() {
  const ss = planilha_();
  ss.setSpreadsheetTimeZone(TZ);
  ss.setSpreadsheetLocale('pt_BR');
  ss.setRecalculationInterval(SpreadsheetApp.RecalculationInterval.HOUR); // mantém o alerta de 24h em dia
  PropertiesService.getScriptProperties().setProperty('PLANILHA_ID', ss.getId());

  montaLeads_(ss);
  montaAcessos_(ss);
  montaLPs_(ss);
  montaDashboard_(ss);

  [ABA.DASH, ABA.LEADS, ABA.ACESSOS, ABA.LPS].forEach((nome, i) => {
    ss.setActiveSheet(ss.getSheetByName(nome));
    ss.moveActiveSheet(i + 1);
  });
  ['Página1', 'Página 1', 'Planilha1', 'Sheet1'].forEach((nome) => {
    const aba = ss.getSheetByName(nome);
    if (aba && aba.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(aba);
  });
  ss.setActiveSheet(ss.getSheetByName(ABA.DASH));
  avisa_(ss, 'Planilha pronta! Próximo passo: Implantar → Nova implantação → App da Web (veja o README).');
}

function montaLeads_(ss) {
  const aba = garanteAba_(ss, ABA.LEADS);
  garanteLinhas_(aba, 3000);
  const corGrupo = { lead: '#2a2421', crm: '#4a3aa7', origem: '#7d736d' };
  montaCabecalho_(aba, COLS_LEADS, (c) => corGrupo[c.grupo]);
  aba.setTabColor('#4a3aa7');

  const n = aba.getMaxRows() - 1;
  const status = aba.getRange(2, L['Status'], n, 1);
  status.setHorizontalAlignment('center').setDataValidation(
    SpreadsheetApp.newDataValidation().requireValueInList(STATUS, true).setAllowInvalid(false).build());
  aba.getRange(2, L['Agendado para'], n, 1).setDataValidation(
    SpreadsheetApp.newDataValidation().requireDate().setAllowInvalid(false)
      .setHelpText('Data e hora do agendamento, ex.: 15/10/2026 14:30').build());
  aba.getRange(2, L['Valor (R$)'], n, 1).setDataValidation(
    SpreadsheetApp.newDataValidation().requireNumberGreaterThanOrEqualTo(0).setAllowInvalid(false)
      .setHelpText('Valor fechado com o cliente. Preencha ao marcar como Concluído.').build());

  const regras = STATUS.map((s) => SpreadsheetApp.newConditionalFormatRule()
    .whenTextEqualTo(s)
    .setBackground(COR_STATUS[s].fundo).setFontColor(COR_STATUS[s].texto).setBold(true)
    .setRanges([status]).build());
  const e = letra_(L['Entrada']);
  const st = letra_(L['Status']);
  regras.push(SpreadsheetApp.newConditionalFormatRule()
    .whenFormulaSatisfied(`=AND($${st}2="Contato",$${e}2<>"",NOW()-$${e}2>1)`)
    .setBackground(COR_STATUS['Falhou'].fundo).setFontColor(COR_STATUS['Falhou'].texto)
    .setRanges([aba.getRange(2, L['ID'], n, 2)]).build());
  aba.setConditionalFormatRules(regras);

  aba.getRange(1, L['Status']).setNote(
    'Contato: lead novo — fazer o primeiro contato.\n' +
    'Resgatar: não respondeu ou sumiu — tentar de novo.\n' +
    'Agendado: horário marcado (preencha "Agendado para").\n' +
    'Falhou: sem interesse, desistiu ou número inválido.\n' +
    'Concluído: realizou o procedimento (preencha "Valor").');
  aba.getRange(1, L['ID']).setNote('ID e Entrada ficam vermelhos quando o lead está em "Contato" há mais de 24h.');
  aba.getRange(1, L['Repetido']).setNote('ID do lead anterior com o mesmo WhatsApp, se houver.');
}

function montaAcessos_(ss) {
  const aba = garanteAba_(ss, ABA.ACESSOS);
  montaCabecalho_(aba, COLS_ACESSOS, () => '#7d736d');
  aba.setTabColor('#7d736d');
  aba.getRange(1, 1).setNote('Uma linha por visita (1 por sessão em cada LP). Preenchida automaticamente — não edite.');
}

function montaLPs_(ss) {
  const aba = garanteAba_(ss, ABA.LPS);
  montaCabecalho_(aba, COLS_LPS, () => '#2a2421');
  aba.setTabColor('#2a2421');
  if (aba.getLastRow() < 2) {
    aba.getRange(2, 1, LPS_INICIAIS.length, 3).setValues(LPS_INICIAIS);
    aba.getRange(2, 5, LPS_INICIAIS.length, 1).setValue(0);
  }
  aba.getRange(2, 5, aba.getMaxRows() - 1, 1).setDataValidation(
    SpreadsheetApp.newDataValidation().requireNumberGreaterThanOrEqualTo(0).setAllowInvalid(false).build());
  aba.getRange(1, 1).setNote('Igual ao data-lp da página (lp/limpeza-de-pele/ → limpeza-de-pele). ' +
    'Depois de incluir, remover ou reordenar LPs: menu CRM LPs → Atualizar dashboard. Máximo de 8.');
  aba.getRange(1, 5).setNote('Total investido em anúncios para esta LP. Usado no custo por lead do Dashboard.');
}

/* ======================================================================
 * Dashboard
 * ==================================================================== */

// Colunas auxiliares (ocultas) usadas pelos gráficos
const AUX_INICIO = 16; // P em diante fica oculto
const AUX_ID = 17;     // Q: ID de cada LP da tabela; Q3/R3: início e fim do período
const AUX_G1 = 19;     // S..X: dados do gráfico de status
const AUX_G2 = 26;     // Z..AH: dados do gráfico diário
const PERIODOS = ['Tudo', 'Hoje', 'Últimos 7 dias', 'Últimos 30 dias', 'Este mês', 'Mês passado', 'Personalizado'];

function montaDashboard_(ss) {
  const aba = garanteAba_(ss, ABA.DASH);
  const lps = lpsCadastradas_(ss);
  const n = lps.length;
  if (!n) throw new Error('Cadastre pelo menos uma LP na aba "LPs" antes de montar o dashboard.');

  // Guarda o período escolhido para não perder ao reconstruir.
  let anterior = null;
  if (aba.getLastRow() >= 3) {
    const v = aba.getRange('C3:I3').getValues()[0];
    if (PERIODOS.indexOf(v[0]) >= 0) anterior = { periodo: v[0], de: v[4], ate: v[6] };
  }

  aba.getCharts().forEach((c) => aba.removeChart(c));
  aba.getProtections(SpreadsheetApp.ProtectionType.SHEET).forEach((p) => p.remove());
  garanteColunas_(aba, AUX_G2 + CORES_LPS.length);
  garanteLinhas_(aba, 120);
  aba.showColumns(1, aba.getMaxColumns());
  const tudo = aba.getRange(1, 1, aba.getMaxRows(), aba.getMaxColumns());
  tudo.breakApart().clearDataValidations().clear();
  aba.clearConditionalFormatRules();
  aba.setHiddenGridlines(true);
  aba.setTabColor('#2a78d6');
  tudo.setBackground(FUNDO).setFontColor(TINTA).setFontSize(10).setVerticalAlignment('middle');
  aba.setColumnWidth(1, 16);
  aba.setColumnWidth(2, 210);
  aba.setColumnWidths(3, 12, 100);
  aba.setColumnWidth(15, 16);

  // Intervalos abertos: crescem sozinhos com as novas linhas
  const LE = col_(ABA.LEADS, L['Entrada']);
  const LL = col_(ABA.LEADS, L['LP']);
  const LS = col_(ABA.LEADS, L['Status']);
  const LV = col_(ABA.LEADS, L['Valor (R$)']);
  const LO = col_(ABA.LEADS, L['Origem']);
  const AD = col_(ABA.ACESSOS, A['Data']);
  const AL = col_(ABA.ACESSOS, A['LP']);
  const PL = `${LE},">="&PERIODO_INI,${LE},"<"&(PERIODO_FIM+1)`; // leads dentro do período
  const PA = `${AD},">="&PERIODO_INI,${AD},"<"&(PERIODO_FIM+1)`; // acessos dentro do período
  const INVEST = `SUM('${ABA.LPS}'!$E$2:$E)`;

  /* --- Cabeçalho e período --- */
  aba.setRowHeight(1, 46);
  aba.getRange('B1').setValue('Dashboard · Landing Pages').setFontSize(18).setFontWeight('bold');
  aba.getRange('B2').setValue('Atualiza sozinho com as abas Leads e Acessos. Escolha o período ao lado de "Período".')
    .setFontColor(TINTA_2);
  aba.setRowHeight(3, 32);
  aba.getRange('B3').setValue('Período').setFontWeight('bold').setHorizontalAlignment('right');
  const campoPeriodo = aba.getRange('C3:D3').merge();
  campoPeriodo.setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(PERIODOS, true).setAllowInvalid(false).build());
  aba.getRange('F3').setValue('De').setHorizontalAlignment('right').setFontColor(TINTA_2);
  aba.getRange('H3').setValue('Até').setHorizontalAlignment('right').setFontColor(TINTA_2);
  const datas = SpreadsheetApp.newDataValidation().requireDate().setAllowInvalid(false).build();
  ['G3', 'I3'].forEach((a1) => aba.getRange(a1).setDataValidation(datas).setNumberFormat('dd/mm/yyyy'));
  aba.getRange('G3').setNote('Só é usado quando o período é "Personalizado".');
  aba.getRangeList(['C3:D3', 'G3', 'I3']).setBackground(CARTAO).setFontWeight('bold')
    .setBorder(true, true, true, true, null, null, '#c3c2b7', SpreadsheetApp.BorderStyle.SOLID);
  aba.getRange('C3').setValue(anterior ? anterior.periodo : 'Tudo');
  if (anterior && anterior.de) aba.getRange('G3').setValue(anterior.de);
  if (anterior && anterior.ate) aba.getRange('I3').setValue(anterior.ate);

  // Início e fim do período (células auxiliares Q3 e R3, com nome)
  aba.getRange(2, AUX_ID, 1, 2).setValues([['Início', 'Fim']]);
  aba.getRange(3, AUX_ID).setFormula(
    `=SWITCH($C$3,"Hoje",TODAY(),"Últimos 7 dias",TODAY()-6,"Últimos 30 dias",TODAY()-29,` +
    `"Este mês",EOMONTH(TODAY(),-1)+1,"Mês passado",EOMONTH(TODAY(),-2)+1,` +
    `"Personalizado",IF($G$3="",TODAY(),$G$3),` +
    `IF(COUNT(${LE})+COUNT(${AD})=0,TODAY(),INT(MIN(${LE},${AD}))))`);
  aba.getRange(3, AUX_ID + 1).setFormula(
    '=SWITCH($C$3,"Mês passado",EOMONTH(TODAY(),-1),"Personalizado",IF($I$3="",TODAY(),$I$3),TODAY())');
  aba.getRange(3, AUX_ID, 1, 2).setNumberFormat('dd/mm/yyyy');
  nomeia_(ss, 'PERIODO_INI', aba.getRange(3, AUX_ID));
  nomeia_(ss, 'PERIODO_FIM', aba.getRange(3, AUX_ID + 1));
  aba.getRange('K3').setValue('Exibindo').setHorizontalAlignment('right').setFontColor(TINTA_2);
  aba.getRange('L3').setFormula('=PERIODO_INI').setNumberFormat('dd/mm/yyyy').setFontWeight('bold').setHorizontalAlignment('center');
  aba.getRange('M3').setValue('até').setHorizontalAlignment('center').setFontColor(TINTA_2);
  aba.getRange('N3').setFormula('=PERIODO_FIM').setNumberFormat('dd/mm/yyyy').setFontWeight('bold').setHorizontalAlignment('center');

  /* --- Indicadores (2 linhas de 6 cartões) --- */
  const K1 = 5;  // linha do rótulo do 1º bloco; o valor fica na linha de baixo
  const K2 = 9;
  const pos = {};
  const kpi = (chave, rotulo, formula, formato, legenda) => ({ chave, rotulo, formula, formato, legenda });
  const bloco1 = [
    kpi('acessos', 'Acessos', () => `=COUNTIFS(${PA})`, '#,##0', '1 por sessão em cada LP'),
    kpi('leads', 'Leads', () => `=COUNTIFS(${PL})`, '#,##0', 'formulários enviados'),
    kpi('conv', 'Conversão da LP', (p) => `=IF(${p.acessos}=0,"—",${p.leads}/${p.acessos})`, '0.0%', 'leads ÷ acessos'),
    kpi('agend', 'Agendados', () => `=COUNTIFS(${PL},${LS},"Agendado")`, '#,##0', 'com horário marcado'),
    kpi('concl', 'Concluídos', () => `=COUNTIFS(${PL},${LS},"Concluído")`, '#,##0', 'procedimento realizado'),
    kpi('fat', 'Faturamento', () => `=SUMIFS(${LV},${PL},${LS},"Concluído")`, REAIS_INTEIRO, '"Valor" dos concluídos'),
  ];
  const bloco2 = [
    kpi('aberto', 'Em aberto', () => `=COUNTIFS(${PL},${LS},"Contato")+COUNTIFS(${PL},${LS},"Resgatar")`, '#,##0', 'em Contato ou Resgatar'),
    kpi('atraso', 'Sem contato há +24h', () => `=COUNTIFS(${LS},"Contato",${LE},"<"&(NOW()-1))`, '#,##0', 'qualquer período · priorize'),
    kpi('falhou', 'Falhou', () => `=COUNTIFS(${PL},${LS},"Falhou")`, '#,##0', 'perdidos no período'),
    kpi('txag', 'Taxa de agendamento', (p) => `=IF(${p.leads}=0,"—",(${p.agend}+${p.concl})/${p.leads})`, '0.0%', '(agendados + concluídos) ÷ leads'),
    kpi('ticket', 'Ticket médio', (p) => `=IF(${p.concl}=0,"—",${p.fat}/${p.concl})`, REAIS_INTEIRO, 'faturamento ÷ concluídos'),
    kpi('cpl', 'Custo por lead', (p) => `=IF(OR(${p.leads}=0,${INVEST}=0),"—",${INVEST}/${p.leads})`, REAIS, 'investimento (aba LPs) ÷ leads'),
  ];
  [[bloco1, K1], [bloco2, K2]].forEach(([bloco, linha]) => bloco.forEach((k, i) => {
    pos[k.chave] = '$' + letra_(3 + 2 * i) + '$' + (linha + 1);
  }));
  cartoes_(aba, K1, 'Funil do período', bloco1, pos);
  cartoes_(aba, K2, 'Atendimento e custo', bloco2, pos);
  aba.setRowHeight(8, 12);
  aba.setRowHeight(12, 22);

  /* --- Tabela por LP --- */
  const T = 13;       // título da seção
  const H = T + 1;    // cabeçalho da tabela
  const P1 = H + 1;   // primeira LP
  const TOT = P1 + n; // linha de total
  titulo_(aba, T, 'Desempenho por landing page', 'mesmo período dos indicadores');
  const cabecalho = ['Landing page', 'Acessos', 'Leads', 'Conversão', 'Contato', 'Resgatar', 'Agendado', 'Falhou', 'Concluído', 'Tx. agend.', 'Faturamento', 'Investimento', 'Custo/lead'];
  aba.getRange(H, 2, 1, 13).setValues([cabecalho]).setFontWeight('bold').setFontColor(TINTA_2)
    .setBackground('#ecebe6').setHorizontalAlignment('center').setWrap(true);
  aba.getRange(H, 2).setHorizontalAlignment('left');
  aba.setRowHeight(H, 30);
  const colStatus = {}; // status → letra da coluna na tabela (F..J)
  STATUS.forEach((s, i) => {
    colStatus[s] = letra_(6 + i);
    aba.getRange(H, 6 + i).setBackground(COR_STATUS[s].fundo).setFontColor(COR_STATUS[s].texto);
  });

  lps.forEach((lp, i) => {
    const r = P1 + i;
    const f = [
      `='${ABA.LPS}'!$B$${lp.linha}`,
      `=COUNTIFS(${PA},${AL},$Q${r})`,
      `=COUNTIFS(${PL},${LL},$Q${r})`,
      `=IF(C${r}=0,"—",D${r}/C${r})`,
    ];
    STATUS.forEach((s) => f.push(`=COUNTIFS(${PL},${LL},$Q${r},${LS},${colStatus[s]}$${H})`));
    f.push(
      `=IF(D${r}=0,"—",(H${r}+J${r})/D${r})`,
      `=SUMIFS(${LV},${PL},${LL},$Q${r},${LS},"Concluído")`,
      `=N('${ABA.LPS}'!$E$${lp.linha})`,
      `=IF(OR(D${r}=0,M${r}=0),"—",M${r}/D${r})`);
    aba.getRange(r, 2, 1, 13).setFormulas([f]);
    aba.getRange(r, AUX_ID).setFormula(`='${ABA.LPS}'!$A$${lp.linha}`);
  });
  const soma = (c) => `=SUM(${c}${P1}:${c}${TOT - 1})`;
  aba.getRange(TOT, 2, 1, 13).setFormulas([[
    'Total', soma('C'), soma('D'), `=IF(C${TOT}=0,"—",D${TOT}/C${TOT})`,
    soma('F'), soma('G'), soma('H'), soma('I'), soma('J'),
    `=IF(D${TOT}=0,"—",(H${TOT}+J${TOT})/D${TOT})`, soma('L'), soma('M'),
    `=IF(OR(D${TOT}=0,M${TOT}=0),"—",M${TOT}/D${TOT})`,
  ]]);
  const corpo = aba.getRange(P1, 2, n + 1, 13);
  corpo.setBackground(CARTAO).setHorizontalAlignment('center')
    .setBorder(null, null, true, null, null, true, LINHA, SpreadsheetApp.BorderStyle.SOLID);
  aba.getRange(P1, 2, n + 1, 1).setHorizontalAlignment('left');
  aba.getRange(TOT, 2, 1, 13).setFontWeight('bold').setBackground('#ecebe6');
  aba.getRange(P1, 3, n + 1, 2).setNumberFormat('#,##0');
  aba.getRange(P1, 5, n + 1, 1).setNumberFormat('0.0%');
  aba.getRange(P1, 6, n + 1, 5).setNumberFormat('#,##0');
  aba.getRange(P1, 11, n + 1, 1).setNumberFormat('0.0%');
  aba.getRange(P1, 12, n + 1, 2).setNumberFormat(REAIS_INTEIRO);
  aba.getRange(P1, 14, n + 1, 1).setNumberFormat(REAIS);
  for (let r = P1; r <= TOT; r++) aba.setRowHeight(r, 28);

  /* --- Gráficos --- */
  const G = TOT + 2;
  // Dados do gráfico de status (S..X), na ordem validada para daltonismo
  aba.getRange(H, AUX_G1, 1, 6).setValues([['LP'].concat(ORDEM_GRAFICO_STATUS)]);
  lps.forEach((lp, i) => {
    const r = P1 + i;
    aba.getRange(r, AUX_G1, 1, 6).setFormulas([[`=B${r}`].concat(ORDEM_GRAFICO_STATUS.map((s) => `=${colStatus[s]}${r}`))]);
  });
  // Dados do gráfico diário (Z..): 30 dias terminando no fim do período, 1 coluna por LP
  aba.getRange(1, AUX_G2, 2, 1).setValues([['ID'], ['Dia']]);
  lps.forEach((lp, i) => {
    const c = AUX_G2 + 1 + i;
    aba.getRange(1, c, 2, 1).setFormulas([[`=$Q$${P1 + i}`], [`=$B$${P1 + i}`]]);
  });
  const diaCol = letra_(AUX_G2);
  const dias = [];
  for (let d = 0; d < 30; d++) {
    const r = 3 + d;
    const linha = [`=PERIODO_FIM-${29 - d}`];
    lps.forEach((lp, i) => {
      const c = letra_(AUX_G2 + 1 + i);
      linha.push(`=COUNTIFS(${LL},${c}$1,${LE},">="&$${diaCol}${r},${LE},"<"&($${diaCol}${r}+1))`);
    });
    dias.push(linha);
  }
  aba.getRange(3, AUX_G2, 30, n + 1).setFormulas(dias);
  aba.getRange(3, AUX_G2, 30, 1).setNumberFormat('dd/mm');
  for (let r = G; r < G + 17; r++) aba.setRowHeight(r, 21);

  const estilo = (b, eixoValor, eixoCategoria) => b
    .setHiddenDimensionStrategy(Charts.ChartHiddenDimensionStrategy.SHOW_BOTH)
    .setNumHeaders(1)
    .setOption('height', 340)
    .setOption('backgroundColor', CARTAO)
    .setOption('titleTextStyle', { color: TINTA, fontSize: 13, bold: true })
    .setOption('legend', { position: 'top', textStyle: { color: TINTA_2, fontSize: 11 } })
    .setOption('isStacked', true)
    .setOption(eixoValor, { minValue: 0, format: '0', gridlines: { color: LINHA }, baselineColor: '#c3c2b7', textStyle: { color: APAGADO, fontSize: 10 } })
    .setOption(eixoCategoria, { textStyle: { color: TINTA_2, fontSize: 10 } });
  const series = (cores) => cores.reduce((o, cor, i) => { o[i] = { color: cor }; return o; }, {});

  aba.insertChart(estilo(aba.newChart().setChartType(Charts.ChartType.BAR), 'hAxis', 'vAxis')
    .addRange(aba.getRange(H, AUX_G1, n + 1, 6))
    .setPosition(G, 2, 0, 0)
    .setOption('width', 700)
    .setOption('title', 'Leads por landing page e status')
    .setOption('series', series(ORDEM_GRAFICO_STATUS.map((s) => COR_STATUS[s].grafico)))
    .setOption('bar', { groupWidth: '62%' })
    .build());
  aba.insertChart(estilo(aba.newChart().setChartType(Charts.ChartType.COLUMN), 'vAxis', 'hAxis')
    .addRange(aba.getRange(2, AUX_G2, 31, n + 1))
    .setPosition(G, 8, 10, 0)
    .setOption('width', 690)
    .setOption('title', 'Leads por dia — 30 dias até o fim do período')
    .setOption('series', series(CORES_LPS.slice(0, n)))
    .setOption('bar', { groupWidth: '72%' })
    .build());

  /* --- Leads por origem --- */
  const O = G + 18;
  titulo_(aba, O, 'Leads por origem', 'utm_source, anúncio ou site de onde a pessoa veio');
  aba.getRange(O + 1, 2, 1, 8).setValues([['Origem', 'Leads', '', '', '', '', 'Concluídos', 'Tx. conclusão']])
    .setFontWeight('bold').setFontColor(TINTA_2).setBackground('#ecebe6').setHorizontalAlignment('center');
  aba.getRange(O + 1, 2).setHorizontalAlignment('left');
  const intervaloLeads = `'${ABA.LEADS}'!$A$2:$${letra_(COLS_LEADS.length)}`;
  const qd = (x) => `YEAR(${x})&"-"&TEXT(MONTH(${x}),"00")&"-"&TEXT(DAY(${x}),"00")&" 00:00:00"`;
  const cId = letra_(L['ID']);
  const cEnt = letra_(L['Entrada']);
  const cOri = letra_(L['Origem']);
  aba.getRange(O + 2, 2).setFormula(
    `=IFERROR(QUERY(${intervaloLeads},"select ${cOri}, count(${cId}) ` +
    `where ${cEnt} >= datetime '"&${qd('PERIODO_INI')}&"' and ${cEnt} < datetime '"&${qd('(PERIODO_FIM+1)')}&"' ` +
    `and ${cOri} <> '' group by ${cOri} order by count(${cId}) desc limit 8 label count(${cId}) ''",0),` +
    `"Nenhum lead no período")`);
  for (let i = 0; i < 8; i++) {
    const r = O + 2 + i;
    aba.getRange(r, 4, 1, 4).merge();
    aba.getRange(r, 4).setFormula(
      `=IF($C${r}="","",SPARKLINE($C${r},{"charttype","bar";"max",MAX($C$${O + 2}:$C$${O + 9});"color1","${COR_STATUS['Contato'].grafico}"}))`);
    aba.getRange(r, 8, 1, 2).setFormulas([[
      `=IF($C${r}="","",COUNTIFS(${PL},${LO},$B${r},${LS},"Concluído"))`,
      `=IF($C${r}="","",IF($C${r}=0,"—",H${r}/$C${r}))`,
    ]]);
    aba.setRowHeight(r, 24);
  }
  const tabOrigem = aba.getRange(O + 2, 2, 8, 8);
  tabOrigem.setBackground(CARTAO).setBorder(null, null, true, null, null, true, LINHA, SpreadsheetApp.BorderStyle.SOLID);
  aba.getRange(O + 2, 3, 8, 1).setNumberFormat('#,##0').setHorizontalAlignment('center');
  aba.getRange(O + 2, 8, 8, 1).setNumberFormat('#,##0').setHorizontalAlignment('center');
  aba.getRange(O + 2, 9, 8, 1).setNumberFormat('0.0%').setHorizontalAlignment('center');

  /* --- Aguardando primeiro contato --- */
  const W = O + 11;
  titulo_(aba, W, 'Aguardando primeiro contato', 'status Contato, dos mais antigos para os mais novos');
  aba.getRange(W + 1, 2, 1, 5).setValues([['Nome', 'Entrada', 'WhatsApp', 'ID', 'LP']])
    .setFontWeight('bold').setFontColor(TINTA_2).setBackground('#ecebe6');
  const colL = (nome) => letra_(L[nome]);
  aba.getRange(W + 2, 2).setFormula(
    `=IFERROR(QUERY(${intervaloLeads},"select ${colL('Nome')}, ${colL('Entrada')}, ${colL('WhatsApp')}, ${colL('ID')}, ${colL('LP')} ` +
    `where ${colL('Status')} = 'Contato' order by ${colL('Entrada')} asc limit 10",0),"Nenhum lead aguardando contato.")`);
  aba.getRange(W + 2, 2, 10, 8).setBackground(CARTAO)
    .setBorder(null, null, true, null, null, true, LINHA, SpreadsheetApp.BorderStyle.SOLID);
  aba.getRange(W + 2, 3, 10, 1).setNumberFormat('dd/mm hh:mm');
  for (let r = W + 1; r < W + 12; r++) aba.setRowHeight(r, 24);

  /* --- Formatação condicional --- */
  const regras = [
    // Conversão por LP: tom de azul mais forte para a maior taxa
    SpreadsheetApp.newConditionalFormatRule()
      .setGradientMinpoint('#ffffff').setGradientMaxpoint('#9ec5f4')
      .setRanges([aba.getRange(P1, 5, n, 1)]).build(),
    // Alerta: há leads parados em Contato há mais de 24h
    SpreadsheetApp.newConditionalFormatRule()
      .whenNumberGreaterThan(0).setFontColor(COR_STATUS['Falhou'].texto)
      .setRanges([aba.getRange(pos.atraso.replace(/\$/g, ''))]).build(),
    SpreadsheetApp.newConditionalFormatRule()
      .whenFormulaSatisfied(`=AND(ISNUMBER($C${W + 2}),NOW()-$C${W + 2}>1)`)
      .setFontColor(COR_STATUS['Falhou'].texto).setBold(true)
      .setRanges([aba.getRange(W + 2, 3, 10, 1)]).build(),
  ];
  aba.setConditionalFormatRules(regras);

  /* --- Acabamento --- */
  aba.hideColumns(AUX_INICIO, aba.getMaxColumns() - AUX_INICIO + 1);
  aba.setFrozenRows(3);
  aba.protect().setDescription('Dashboard: fórmulas automáticas').setWarningOnly(true)
    .setUnprotectedRanges([aba.getRange('C3:D3'), aba.getRange('G3'), aba.getRange('I3')]);
}

function cartoes_(aba, linha, titulo, kpis, pos) {
  aba.getRange(linha, 2, 3, 1).merge();
  aba.getRange(linha, 2).setValue(titulo).setFontWeight('bold').setFontColor(TINTA_2).setWrap(true);
  kpis.forEach((k, i) => {
    const c = 3 + 2 * i;
    aba.getRange(linha, c, 1, 2).merge().setFontColor(TINTA_2).setFontSize(9).setVerticalAlignment('bottom');
    aba.getRange(linha, c).setValue(k.rotulo);
    aba.getRange(linha + 1, c, 1, 2).merge().setNumberFormat(k.formato)
      .setFontSize(20).setFontWeight('bold').setHorizontalAlignment('left');
    aba.getRange(linha + 1, c).setFormula(k.formula(pos));
    aba.getRange(linha + 2, c, 1, 2).merge().setFontColor(APAGADO).setFontSize(8).setVerticalAlignment('top');
    aba.getRange(linha + 2, c).setValue(k.legenda);
    aba.getRange(linha, c, 3, 2).setBackground(CARTAO)
      .setBorder(true, true, true, true, null, null, LINHA, SpreadsheetApp.BorderStyle.SOLID);
  });
  aba.setRowHeight(linha, 26);
  aba.setRowHeight(linha + 1, 38);
  aba.setRowHeight(linha + 2, 22);
}

function titulo_(aba, linha, texto, detalhe) {
  aba.setRowHeight(linha, 34);
  aba.getRange(linha, 2).setValue(texto).setFontSize(12).setFontWeight('bold').setVerticalAlignment('bottom');
  if (detalhe) aba.getRange(linha, 4).setValue(detalhe).setFontColor(APAGADO).setFontSize(9).setVerticalAlignment('bottom');
}

/* ======================================================================
 * Utilitários
 * ==================================================================== */

function planilha_() {
  return SpreadsheetApp.getActiveSpreadsheet() ||
    SpreadsheetApp.openById(PropertiesService.getScriptProperties().getProperty('PLANILHA_ID'));
}

function abaObrigatoria_(nome) {
  const aba = planilha_().getSheetByName(nome);
  if (!aba) throw new Error(`Aba "${nome}" não encontrada. Rode "CRM LPs → Configurar / reparar planilha".`);
  return aba;
}

function garanteAba_(ss, nome) {
  return ss.getSheetByName(nome) || ss.insertSheet(nome);
}

function garanteLinhas_(aba, total) {
  const falta = total - aba.getMaxRows();
  if (falta > 0) aba.insertRowsAfter(aba.getMaxRows(), falta);
}

function garanteColunas_(aba, total) {
  const falta = total - aba.getMaxColumns();
  if (falta > 0) aba.insertColumnsAfter(aba.getMaxColumns(), falta);
}

function montaCabecalho_(aba, cols, corDaColuna) {
  garanteColunas_(aba, cols.length);
  aba.getRange(1, 1, 1, cols.length).setValues([cols.map((c) => c.nome)])
    .setFontWeight('bold').setFontColor('#ffffff').setVerticalAlignment('middle').setWrap(true);
  cols.forEach((c, i) => {
    aba.setColumnWidth(i + 1, c.larg);
    aba.getRange(1, i + 1).setBackground(corDaColuna(c));
    if (c.formato) aba.getRange(2, i + 1, aba.getMaxRows() - 1, 1).setNumberFormat(c.formato);
  });
  aba.setRowHeight(1, 34);
  aba.setFrozenRows(1);
}

function lpsCadastradas_(ss) {
  const aba = ss.getSheetByName(ABA.LPS);
  if (!aba || aba.getLastRow() < 2) return [];
  const lps = aba.getRange(2, 1, aba.getLastRow() - 1, 2).getValues()
    .map((v, i) => ({ id: String(v[0]).trim(), nome: String(v[1]).trim(), linha: i + 2 }))
    .filter((lp) => lp.id);
  if (lps.length > CORES_LPS.length) {
    avisa_(ss, `O dashboard mostra as ${CORES_LPS.length} primeiras LPs da aba LPs.`);
  }
  return lps.slice(0, CORES_LPS.length);
}

function nomeia_(ss, nome, range) {
  try { ss.removeNamedRange(nome); } catch (e) { /* ainda não existia */ }
  ss.setNamedRange(nome, range);
}

function indices_(cols) {
  const m = {};
  cols.forEach((c, i) => { m[c.nome] = i + 1; });
  return m;
}

function letra_(n) {
  let s = '';
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

// Coluna inteira a partir da linha 2, ex.: 'Leads'!$H$2:$H
function col_(nomeAba, n) {
  const c = letra_(n);
  return `'${nomeAba}'!$${c}$2:$${c}`;
}

function avisa_(ss, msg) {
  console.log(msg);
  try { ss.toast(msg, 'CRM LPs', 10); } catch (e) { /* sem interface (ex.: App da Web) */ }
}
