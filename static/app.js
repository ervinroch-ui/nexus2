const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
let appState = null;
let currentUser = null;
let currentPage = "overview";
let editMode = false;

const pageTitles = {
  overview: "Dashboard gerencial",
  multimedia: "Multimedia",
  rosters: "Estructura de equipos",
  conecta: "Conecta / Pospago",
  solicitudes: "Solicitudes",
  fuel: "Control de combustible",
  admin: "Administración"
};

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, ch => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));
}
function n(value) { const x = Number(value); return Number.isFinite(x) ? x : 0; }
function fmt(value, decimals = 0) {
  return n(value).toLocaleString("es-NI", {minimumFractionDigits: decimals, maximumFractionDigits: decimals});
}
function money(value, currency = "C$") { return `${currency} ${fmt(value, 2)}`; }
function pct(value, decimals = 2) { return `${fmt(value, decimals)}%`; }
function ratio(a, b) { return b ? (n(a) / n(b)) * 100 : 0; }
function signed(value, decimals = 0) { return `${n(value) > 0 ? "+" : ""}${fmt(value, decimals)}`; }
function deltaClass(value) { return n(value) >= 0 ? "positive" : "negative"; }
function deltaText(value, decimals = 1) { return `${n(value) > 0 ? "+" : ""}${fmt(value, decimals)}%`; }
function shortName(name) { return String(name || "").split(" ").slice(0, 2).join(" "); }

async function api(url, options = {}) {
  const response = await fetch(url, {credentials: "same-origin", ...options});
  const contentType = response.headers.get("content-type") || "";
  const payload = contentType.includes("application/json") ? await response.json() : {};
  if (!response.ok) throw new Error(payload.error || `Error ${response.status}`);
  return payload;
}
function toast(message, kind = "success") {
  const node = $("#toast");
  node.textContent = message;
  node.className = `toast show ${kind}`;
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => node.classList.remove("show"), 3200);
}
function getImport(type) { return (appState?.imports || []).find(item => item.type === type) || null; }
function numericInput(path, value, decimals = 0, extra = "") {
  if (!editMode || currentUser?.role !== "admin") return esc(fmt(value, decimals));
  return `<input class="cell-edit" type="number" step="${decimals ? "0.01" : "1"}" data-path="${esc(path)}" value="${esc(value)}" ${extra}>`;
}
function textInput(path, value) {
  if (!editMode || currentUser?.role !== "admin") return esc(value);
  return `<input class="cell-edit text-edit" type="text" data-path="${esc(path)}" value="${esc(value)}">`;
}
function pill(text, cls = "neutral") { return `<span class="pill ${cls}">${esc(text)}</span>`; }
function sectionHead(kicker, title, right = "") {
  return `<div class="section-head"><div><div class="eyebrow">${esc(kicker)}</div><h2>${esc(title)}</h2></div>${right}</div>`;
}
function miniMetric(label, value, detail, icon = "◈") {
  return `<article class="mini-card"><div class="mini-card-top"><span>${esc(label)}</span><span class="mini-icon">${icon}</span></div><strong>${value}</strong><small>${detail || ""}</small></article>`;
}
function progress(value, cls = "blue") {
  const width = Math.max(0, Math.min(100, n(value)));
  return `<div class="progress-track"><span class="progress-fill ${cls}" style="width:${width}%"></span></div>`;
}
function emptyState(title, copy) {
  return `<div class="empty-state"><div class="empty-symbol">▧</div><b>${esc(title)}</b><p>${esc(copy)}</p></div>`;
}

function renderOverview() {
  const o = appState.overview || {};
  const incomeChange = o.incomePrevious ? ((n(o.incomeCurrent) - n(o.incomePrevious)) / n(o.incomePrevious)) * 100 : 0;
  const highsChange = o.highsPrevious ? ((n(o.highsCurrent) - n(o.highsPrevious)) / n(o.highsPrevious)) * 100 : 0;
  const m = appState.multimedia || {};
  const zoneTotal = (m.zones || []).reduce((s, z) => s + n(z.actual), 0);
  return `
    <div class="page-heading"><div><div class="eyebrow">VISIÓN EJECUTIVA</div><h1>Dashboard Gerencial</h1><p>Lectura consolidada de resultados comerciales y operación.</p></div><div class="heading-chip"><span class="status-dot"></span> Corte operativo · ${esc(appState.period?.label || "Período actual")}</div></div>
    <div class="quick-tabs">
      <button class="quick-tab active" data-page="overview">◫ Resumen</button>
      <button class="quick-tab" data-page="multimedia">▦ Multimedia</button>
      <button class="quick-tab" data-page="rosters">♙ Equipos</button>
      <button class="quick-tab" data-page="conecta">⌁ Conecta</button>
      <button class="quick-tab" data-page="solicitudes">▤ Solicitudes</button>
      <button class="quick-tab" data-page="fuel">◉ Combustible</button>
    </div>
    <div class="kpi-grid four">
      <article class="kpi-card target-card"><div class="kpi-label">RETO DIARIO <span class="kpi-symbol">◎</span></div><div class="kpi-number">${numericInput("overview.dailyChallenge",o.dailyChallenge)}</div><div class="kpi-bottom"><span class="up-arrow">↑</span> Altas/día para alcanzar la meta</div></article>
      <article class="kpi-card green-card"><div class="kpi-label">INGRESOS · PERÍODO FILTRADO <span class="kpi-symbol">＄</span></div><div class="comparison-pair"><div><small>ACTUAL</small><b>${`$ ${numericInput("overview.incomeCurrent",o.incomeCurrent)}`}</b></div><div><small>ANTERIOR</small><b>${`$ ${numericInput("overview.incomePrevious",o.incomePrevious)}`}</b></div></div><div class="kpi-change ${deltaClass(incomeChange)}">${deltaText(incomeChange,1)} ${incomeChange < 0 ? "↓" : "↑"}</div><div class="kpi-detail">Diferencia: <b>${money(n(o.incomeCurrent)-n(o.incomePrevious),"$")}</b></div></article>
      <article class="kpi-card blue-card"><div class="kpi-label">ALTAS · PERÍODO FILTRADO <span class="kpi-symbol">♟</span></div><div class="comparison-pair"><div><small>ACTUAL</small><b>${numericInput("overview.highsCurrent",o.highsCurrent)}</b></div><div><small>ANTERIOR</small><b>${numericInput("overview.highsPrevious",o.highsPrevious)}</b></div></div><div class="kpi-change ${deltaClass(highsChange)}">${deltaText(highsChange,1)} ${highsChange < 0 ? "↓" : "↑"}</div><div class="kpi-detail">Diferencia: <b>${signed(n(o.highsCurrent)-n(o.highsPrevious))}</b></div></article>
      <article class="kpi-card purple-card"><div class="kpi-label">AÑO ANTERIOR · MISMO MES <span class="kpi-symbol">▦</span></div><div class="comparison-pair"><div><small>ALTAS</small><b>${numericInput("overview.priorYearHighs",o.priorYearHighs)}</b></div><div><small>INGRESOS</small><b>${`$ ${numericInput("overview.priorYearIncome",o.priorYearIncome)}`}</b></div></div><div class="prior-year-pills"><span>${pill("4.2% ↑","good")}</span><span>${pill("1.5% ↑","good")}</span></div><div class="kpi-detail">Base de comparación anual</div></article>
    </div>
    <div class="content-grid two-col">
      <section class="panel">
        ${sectionHead("MULTIMEDIA · PACÍFICO", "Avance por gerencia", `<button class="text-link" data-page="multimedia">Ver detalle →</button>`)}
        <div class="zone-summary"><div><strong>${fmt(m.real)}</strong><span>Altas reales</span></div><div><strong>${fmt(m.goal)}</strong><span>Meta del tablero</span></div><div><strong>${pct(ratio(m.real,m.goal))}</strong><span>Avance</span></div></div>
        <div class="zone-bars">${(m.zones||[]).map((z,i)=>`<div class="zone-bar-row"><div><b>${esc(z.name)}</b><span>${fmt(z.actual)} / ${fmt(z.goal)}</span></div>${progress(ratio(z.actual,z.goal),i===2||i===3?"green":"blue")}<strong>${pct(ratio(z.actual,z.goal))}</strong></div>`).join("")}</div>
      </section>
      <section class="panel">
        ${sectionHead("CONTROL DE OPERACIÓN", "Lecturas rápidas", `<span class="subtle-tag">Corte actual</span>`)}
        <div class="insight-list">
          <div class="insight-item"><div class="insight-icon teal">↗</div><div><b>Proyección Multimedia</b><span>${fmt(m.projection)} altas estimadas al cierre</span></div><strong>${pct(ratio(m.projection,m.goal))}</strong></div>
          <div class="insight-item"><div class="insight-icon blue">▤</div><div><b>Solicitudes atendidas</b><span>${fmt(getImport("solicitudes")?.summary?.attended || 0)} registros procesados en Excel</span></div><strong>${getImport("solicitudes") ? "OK" : "—"}</strong></div>
          <div class="insight-item"><div class="insight-icon orange">⛽</div><div><b>Vehículos sobre asignación</b><span>${fmt((appState.fuelRows||[]).filter(x=>n(x.spent)>n(x.budget)).length)} unidades excedidas en la muestra</span></div><strong>${money((appState.fuelRows||[]).reduce((s,x)=>s+Math.max(0,n(x.spent)-n(x.budget)),0))}</strong></div>
        </div>
        <div class="note-strip">Las cifras de esta vista son el corte visible en las capturas de referencia. Los libros importados aparecen en sus módulos y se pueden actualizar desde Administración.</div>
      </section>
    </div>
  `;
}

function renderMultimedia() {
  const m = appState.multimedia || {};
  const source = getImport("multimedia");
  const excelMetrics = source?.summary || {};
  const dailyMetrics = excelMetrics.daily || {};
  const targetMetrics = excelMetrics.targets || {};
  const actualPct = ratio(m.real,m.goal);
  const projectionPct = ratio(m.projection,m.goal);
  const zones = m.zones || [];
  const supervisors = m.supervisors || [];
  const zoneRows = zones.map((z,i)=>`<tr>
      <td class="name-cell"><span class="row-dot"></span>${textInput(`multimedia.zones.${i}.name`,z.name)}</td>
      <td>${numericInput(`multimedia.zones.${i}.goal`,z.goal)}</td><td class="strong-cell">${numericInput(`multimedia.zones.${i}.actual`,z.actual)}</td>
      <td><span class="rate-pill ${ratio(z.actual,z.goal)>=100?'good':ratio(z.actual,z.goal)>=70?'warn':'bad'}">${pct(ratio(z.actual,z.goal))}</span></td>
      <td class="projection-cell">${numericInput(`multimedia.zones.${i}.projection`,z.projection)}</td><td>${pct(ratio(z.projection,z.goal))}</td>
      <td class="${deltaClass(z.vsM2M)}">${signed(z.vsM2M)}</td><td>${signed(z.vsM2MPct,2)}%</td><td class="${deltaClass(z.vsY2Y)}">${signed(z.vsY2Y)}</td><td>${signed(z.vsY2YPct,2)}%</td>
      <td>${fmt(z.executives)} / ${fmt(z.executiveRoster)}</td><td>${pct(ratio(z.executives,z.executiveRoster))}</td><td class="strong-cell">${fmt(z.highsPerExecutive,2)}</td>
    </tr>`).join("");
  const supervisorRows = supervisors.map((s,i)=>`<tr>
    <td class="name-cell">${textInput(`multimedia.supervisors.${i}.name`,s.name)}</td>
    ${["dth","intHfc","tvHfc","lda","ifi","intGpon","tvGpon","total","projection","goalPct"].map(key=>`<td>${numericInput(`multimedia.supervisors.${i}.${key}`,s[key])}${key==="goalPct"&&!editMode?"%":""}</td>`).join("")}
  </tr>`).join("");
  const totals = supervisors.reduce((a,s)=>{["dth","intHfc","tvHfc","lda","ifi","intGpon","tvGpon","total","projection"].forEach(k=>a[k]+=n(s[k]));return a;},{dth:0,intHfc:0,tvHfc:0,lda:0,ifi:0,intGpon:0,tvGpon:0,total:0,projection:0});
  return `
    <div class="page-heading"><div><div class="eyebrow">UNIDAD DE NEGOCIO</div><h1>Multimedia</h1><p>Metas, proyección, efectividad y desempeño por gerencia y supervisor.</p></div><div class="heading-chip">▦ ${esc(m.monthLabel || "Período actual")}</div></div>
    <div class="subnav"><button class="subnav-item active">Resumen</button><button class="subnav-item" data-scroll="promotoria">Promotoría</button><button class="subnav-item" data-scroll="supervisors">Supervisores</button><button class="subnav-item" data-scroll="formula">Productividad / fórmula</button><button class="subnav-item" data-scroll="zones">Guerra de zonas</button></div>
    <div class="kpi-grid four multimedia-kpis">
      <article class="stat-card"><div class="stat-icon target">◎</div><div class="stat-label">REAL / META</div><strong>${numericInput("multimedia.real",m.real)} <small>de ${numericInput("multimedia.goal",m.goal)}</small></strong>${progress(actualPct,"orange")}<div class="stat-foot"><b class="orange-text">${pct(actualPct)} · ${actualPct<90?"EN RIESGO":"EN META"}</b></div></article>
      <article class="stat-card"><div class="stat-icon projection">⌁</div><div class="stat-label">PROYECCIÓN</div><strong class="projection-number">${numericInput("multimedia.projection",m.projection)}</strong><b class="projection-caption">Proyección ${pct(projectionPct)}</b><div class="stat-foot split"><span>Contra mes</span><b class="positive">+9.64% ↑</b></div><div class="stat-foot split"><span>Contra año</span><b class="positive">+15.86% ↑</b></div></article>
      <article class="stat-card"><div class="stat-icon revenue">＄</div><div class="stat-label">INGRESOS REALES</div><strong class="revenue-number">$ ${numericInput("multimedia.income",m.income,2)}</strong><div class="stat-foot split"><span>Vs mes ant.</span><b class="positive">+${money(m.monthIncomeChangeValue||1437.28,"$")} (+${fmt(m.monthIncomeChange,2)}%)</b></div><div class="stat-foot split"><span>Vs año ant.</span><b class="positive">+${money(m.yearIncomeChangeValue||2950.19,"$")} (+${fmt(m.yearIncomeChange,2)}%)</b></div></article>
      <article class="stat-card"><div class="stat-icon effect">♙</div><div class="stat-label">EFECTIVIDAD DE ALTAS X EJEC.</div><strong class="effect-number">${numericInput("multimedia.effectiveness",m.effectiveness,2)} <small class="negative">-1.02% ↓</small></strong><p class="stat-description">Proyección vs. ejecución con ventas</p><div class="stat-foot">Cierre de octubre: 23.07 (2,099 ÷ 91)</div></article>
    </div>
    ${source ? `<section class="panel excel-source-panel"><div class="section-head"><div><div class="eyebrow">LECTURA DIRECTA DEL LIBRO MULTIMEDIA</div><h2>Metas y parte diario según Excel</h2></div><span class="subtle-tag">${esc(source.filename)}</span></div><div class="excel-metric-grid"><div><small>Meta de altas mensual</small><b>${fmt(targetMetrics.monthlyHighs)}</b></div><div><small>Plazas presupuestadas</small><b>${fmt(targetMetrics.plazas)}</b></div><div><small>Productos ponderados del corte</small><b>${fmt(dailyMetrics.weightedProducts)}</b></div><div><small>Reto diario del corte</small><b>${fmt(dailyMetrics.dailyChallenge)}</b></div><div><small>Déficit del corte</small><b class="${n(dailyMetrics.deficit)<0?'negative':'positive'}">${signed(dailyMetrics.deficit)}</b></div><div><small>Roster / vendieron</small><b>${fmt(dailyMetrics.roster)} / ${fmt(dailyMetrics.sellers)}</b></div><div><small>Cumplimiento del corte</small><b>${pct(n(dailyMetrics.completion)*100)}</b></div><div><small>Efectividad del corte</small><b>${pct(n(dailyMetrics.effectiveness)*100)}</b></div></div><p class="table-caption">Este bloque reproduce la hoja MES y la hoja meta nov. Es una lectura del archivo y se mantiene separada del tablero mensual capturado en imágenes.</p></section>` : ""}
    <section class="panel table-panel" id="zones">
      ${sectionHead("DETALLE: MULTIMEDIA", "Resumen por gerencia", `<span class="subtle-tag">${esc(m.monthLabel || "")}</span>`)}
      <div class="table-wrap"><table class="data-table wide-table"><thead><tr><th>Jerarquía</th><th>Meta</th><th>Real</th><th>Avance</th><th>Proy.</th><th>Proy. %</th><th>Vs M2M</th><th>Vs M2M %</th><th>Vs Y2Y</th><th>Vs Y2Y %</th><th>Ejec. con vtas</th><th>Ejec. vtas %</th><th>Altas x ejec.</th></tr></thead><tbody>${zoneRows}<tr class="total-row"><td>Total</td><td>${fmt(m.goal)}</td><td>${fmt(m.real)}</td><td><span class="rate-pill warn">${pct(actualPct)}</span></td><td>${fmt(m.projection)}</td><td>${pct(projectionPct)}</td><td class="positive">+131</td><td>+9.64%</td><td class="positive">+204</td><td>+15.86%</td><td>89 / 96</td><td>92.71%</td><td>${fmt(m.effectiveness,2)}</td></tr></tbody></table></div>
      <p class="table-caption">M2M = comparación contra el mes anterior · Y2Y = comparación contra el mismo período del año anterior.</p>
    </section>
    <section class="panel table-panel" id="supervisors">
      ${sectionHead("PRODUCTIVIDAD", "Detalle supervisor / ejecutivo", `<span class="subtle-tag">11 supervisores en captura</span>`)}
      <div class="table-wrap"><table class="data-table supervisor-table"><thead><tr><th>Supervisor</th><th>DTH</th><th>INT HFC</th><th>TV HFC</th><th>LDA</th><th>IFI</th><th>INT GPON</th><th>TV GPON</th><th>Total altas</th><th>Proyección</th><th>% meta</th></tr></thead><tbody>${supervisorRows}<tr class="total-row"><td>Total general</td><td>${fmt(totals.dth)}</td><td>${fmt(totals.intHfc)}</td><td>${fmt(totals.tvHfc)}</td><td>${fmt(totals.lda)}</td><td>${fmt(totals.ifi)}</td><td>${fmt(totals.intGpon)}</td><td>${fmt(totals.tvGpon)}</td><td>${fmt(totals.total)}</td><td>${fmt(totals.projection)}</td><td>—</td></tr></tbody></table></div>
    </section>
    <section class="panel formula-panel" id="formula">
      ${sectionHead("REGLA DE CÁLCULO DEL EXCEL", "Simulador de productividad diaria", pill("Fórmula trasladada", "good"))}
      <p class="muted">Parte diario: CCT × 3 + CCD × 2 + INDV + IFI + DTH. Déficit = productos ponderados − reto diario. Cumplimiento = ponderado ÷ reto diario.</p>
      <form id="formulaForm" class="formula-grid"><label>CCT<input type="number" min="0" step="1" name="cct" value="5"></label><label>CCD<input type="number" min="0" step="1" name="ccd" value="2"></label><label>INDV<input type="number" min="0" step="1" name="indv" value="1"></label><label>IFI<input type="number" min="0" step="1" name="ifi" value="0"></label><label>DTH<input type="number" min="0" step="1" name="dth" value="1"></label><label>Reto diario<input type="number" min="0" step="1" name="challenge" value="20"></label><button class="btn btn-primary" type="submit">Calcular</button></form>
      <div id="formulaResult" class="formula-result"><span>Resultado ponderado</span><b>21</b><span>Déficit: 1 · Cumplimiento: 105%</span></div>
    </section>
    <div class="note-strip">${esc(m.sourceNote || "Indicadores tomados del tablero de referencia y de los Excel cargados.")} ${source ? `Último Excel de Multimedia: ${esc(source.filename)} · ${fmt(source.rows)} filas revisadas.` : ""}</div>
  `;
}

function renderConecta() {
  const imp = getImport("conecta");
  if (!imp) return `<div class="page-heading"><div><div class="eyebrow">POSPAGO / CONECTA</div><h1>Conecta</h1><p>Importá el libro mensual para ver altas por supervisor y producto.</p></div></div>${emptyState("Todavía no hay un libro Conecta", "En Administración cargá JUAN DIEGO CONECTA.xlsx para alimentar este módulo.")}`;
  const s = imp.summary || {};
  const rows = s.supervisorTotals || s.novemberSupervisors || [];
  const monthName = s.currentMonth || "Noviembre";
  const monthTotal = s.currentMonthTotal ?? s.novemberTotal ?? 0;
  const historyMonths = s.historyMonths || ["Agosto","Septiembre","Octubre"];
  const products = ["DTH","INT HFC","TV HFC","LDA","IFI","INT GPON","TV GPON"];
  return `
    <div class="page-heading"><div><div class="eyebrow">POSPAGO / CONECTA</div><h1>Conecta · Producción mensual</h1><p>Consolidado de producción por responsable y producto desde el libro mensual.</p></div><div class="heading-chip">Archivo: ${esc(imp.filename)}</div></div>
    <div class="kpi-grid three">${miniMetric(`ALTAS EN ${monthName}`,fmt(monthTotal),`Total general de la hoja ${monthName}`,"↗")}${miniMetric("ALTAS POR SUPERVISORES",fmt(rows.reduce((a,r)=>a+n(r.total),0)),"Subtotal de grupos detectados","♟")}${miniMetric("REFERIDOS",fmt(s.referredTotal||0),"Bloque de referidos separado","＋")}</div>
    <section class="panel table-panel">${sectionHead(monthName, "Altas por supervisor y producto", `<span class="subtle-tag">${fmt(imp.rows)} filas del libro</span>`)}
      <div class="table-wrap"><table class="data-table"><thead><tr><th>Supervisor</th>${products.map(x=>`<th>${x}</th>`).join("")}<th>Total</th></tr></thead><tbody>${rows.map(r=>`<tr><td class="name-cell">${esc(r.name)}</td>${products.map(x=>`<td>${fmt(r.products?.[x]||0)}</td>`).join("")}<td class="strong-cell">${fmt(r.total)}</td></tr>`).join("")}<tr class="total-row"><td>Total de equipos</td>${products.map(x=>`<td>${fmt(rows.reduce((a,r)=>a+n(r.products?.[x]),0))}</td>`).join("")}<td>${fmt(rows.reduce((a,r)=>a+n(r.total),0))}</td></tr></tbody></table></div>
      <div class="table-footnote">Referidos contabilizados aparte: <b>${fmt(s.referredTotal||0)}</b> · Total general del libro: <b>${fmt(monthTotal)}</b>.</div>
    </section>
    ${(s.performance||[]).length ? `<section class="panel table-panel">${sectionHead("GENERAL OESTE · CÁLCULOS DEL LIBRO", "Meta, producción y proyección por producto")}<div class="table-wrap"><table class="data-table"><thead><tr><th>Grupo</th><th>Producto</th><th>Meta</th>${historyMonths.map(x=>`<th>${esc(x)}</th>`).join("")}<th>${esc(monthName)}</th><th>Proyección</th><th>Cumplimiento</th><th>${esc(monthName)} / ${esc(historyMonths[historyMonths.length-1]||"Mes ant.")}</th></tr></thead><tbody>${s.performance.map(r=>`<tr><td class="name-cell">${esc(r.group)}</td><td>${esc(r.product)}</td><td>${fmt(r.goal)}</td>${(r.history||[r.august,r.september,r.october]).map(x=>`<td>${fmt(x)}</td>`).join("")}<td class="strong-cell">${fmt(r.current ?? r.november)}</td><td class="projection-cell">${r.projection===null?"—":fmt(r.projection,2)}</td><td>${r.completion===null?"—":pct(r.completion*100)}</td><td>${r.vsMonth===null?"—":pct(r.vsMonth*100)}</td></tr>`).join("")}</tbody></table></div><p class="table-caption">La hoja GENERAL OESTE contiene fórmulas de proyección, cumplimiento y comparación con el último mes histórico para ${esc(monthName)}. Si la meta de un producto es cero, la aplicación evita mostrar un porcentaje inválido.</p></section>` : ""}
    <section class="panel">${sectionHead("HISTÓRICO", "Meses detectados en el archivo")}
      <div class="month-chips">${(s.monthlySheets||[]).map(x=>pill(x,"blue-soft")).join("")}</div>
      <div class="formula-explain"><b>Fórmulas detectadas:</b> ${fmt(s.formulas)} celdas calculadas en el libro. <span class="muted">Se conservan las reglas de subtotal y total por producto; los campos sin meta o con división entre cero se presentan como no disponibles.</span></div>
    </section>
    <div class="note-strip">Se muestran agregados por supervisor y producto. No se incorporan cédulas ni datos bancarios del roster.</div>
  `;
}

function renderSolicitudes() {
  const imp = getImport("solicitudes");
  if (!imp) return `<div class="page-heading"><div><div class="eyebrow">REGISTRO COMERCIAL</div><h1>Solicitudes</h1><p>Registros, atenciones, servicios y distribución por zona.</p></div></div>${emptyState("No hay un archivo de solicitudes", "Cargá Ventas Noviembre.xlsx desde Administración.")}`;
  const s=imp.summary||{};
  const bars = (items, max=0) => (items||[]).slice(0,10).map(item=>`<div class="rank-row"><div><b>${esc(item.name)}</b><span>${fmt(item.count)}</span></div>${progress(max?ratio(item.count,max):100,"blue")}</div>`).join("");
  const serviceMax=Math.max(1,...(s.serviceTypes||[]).map(x=>n(x.count)));
  const zoneMax=Math.max(1,...(s.zones||[]).map(x=>n(x.count)));
  const sellerMax=Math.max(1,...(s.sellers||[]).map(x=>n(x.count)));
  return `
    <div class="page-heading"><div><div class="eyebrow">REGISTRO COMERCIAL</div><h1>Solicitudes atendidas y registradas</h1><p>Consolidado de la exportación de ventas. Se excluyeron datos de clientes y contacto.</p></div><div class="heading-chip">${esc(imp.filename)}</div></div>
    <div class="kpi-grid three">${miniMetric("SOLICITUDES REGISTRADAS",fmt(s.registered),"Filas en hoja REGISTRADAS","▤")}${miniMetric("SOLICITUDES ATENDIDAS",fmt(s.attended),"Filas en hoja ATENDIDAS","✓")}${miniMetric("TIPOS DE SERVICIO",fmt((s.serviceTypes||[]).length),"Categorías identificadas","◈")}</div>
    <div class="content-grid two-col">
      <section class="panel">${sectionHead("SERVICIOS", "Atenciones por tipo") }<div class="rank-list">${bars(s.serviceTypes,serviceMax)||"Sin datos"}</div></section>
      <section class="panel">${sectionHead("DISTRIBUCIÓN", "Atenciones por zona") }<div class="rank-list">${bars(s.zones,zoneMax)||"Sin datos"}</div></section>
    </div>
    <div class="content-grid two-col">
      <section class="panel">${sectionHead("RESPONSABLES", "Atenciones por supervisor") }<div class="rank-list">${bars(s.supervisors,Math.max(1,...(s.supervisors||[]).map(x=>n(x.count))))||"Sin datos"}</div></section>
      <section class="panel">${sectionHead("FUERZA COMERCIAL", "Principales vendedores") }<div class="rank-list">${bars(s.sellers,sellerMax)||"Sin datos"}</div></section>
    </div>
    <div class="note-strip">Se contabilizan filas de servicio atendidas; un mismo cliente puede aparecer en más de una fila cuando solicitó varios productos. No equivale necesariamente a clientes únicos ni a altas instaladas.</div>
  `;
}

function renderFuel() {
  const rows=appState.fuelRows||[];
  const over=rows.filter(r=>n(r.spent)>n(r.budget));
  const spent=rows.reduce((a,r)=>a+n(r.spent),0);
  const budget=rows.reduce((a,r)=>a+n(r.budget),0);
  const liters=rows.reduce((a,r)=>a+n(r.liters),0);
  const rowHtml=rows.map((r,i)=>{
    const diff=n(r.budget)-n(r.spent); const isOver=diff<0;
    return `<tr><td class="strong-cell">${textInput(`fuelRows.${i}.plate`,r.plate)}</td><td>${textInput(`fuelRows.${i}.manager`,r.manager)}</td><td>${textInput(`fuelRows.${i}.management`,r.management)}</td><td>${textInput(`fuelRows.${i}.vehicle`,r.vehicle)}</td><td>${textInput(`fuelRows.${i}.driver`,r.driver)}</td><td>${numericInput(`fuelRows.${i}.loads`,r.loads)}</td><td>${numericInput(`fuelRows.${i}.liters`,r.liters,2)}</td><td>C$ ${numericInput(`fuelRows.${i}.spent`,r.spent,2)}</td><td>C$ ${numericInput(`fuelRows.${i}.budget`,r.budget,2)}</td><td class="${isOver?'negative':'positive'}">${isOver?"−":"+"}${money(Math.abs(diff))}</td><td>${pill(isOver?"Sobregiro":"Dentro",isOver?"bad":"good")}</td></tr>`;
  }).join("");
  const plan=appState.fuelPlan||[];
  return `
    <div class="page-heading"><div><div class="eyebrow">CONTROL OPERATIVO</div><h1>Combustible por placa</h1><p>Gasto semanal, asignación, diferencia y planificación de recorridos.</p></div><div class="heading-chip">Semana 16 al 21 · Noviembre 2026</div></div>
    <div class="kpi-grid four">${miniMetric("GASTO REGISTRADO",money(spent),"Suma de placas visibles","＄")}${miniMetric("ASIGNACIÓN",money(budget),"Presupuesto semanal","▤")}${miniMetric("SOBREGIRO",money(Math.max(0,spent-budget)),`${over.length} vehículos sobre asignación`,"↗")}${miniMetric("LITROS CONSUMIDOS",`${fmt(liters,2)} L`,"Volumen registrado","⛽")}</div>
    <section class="panel table-panel">${sectionHead("CONTROL SEMANAL", "Detalle por placa", `<span class="subtle-tag">${rows.length} vehículos visibles</span>`)}
      <div class="table-wrap"><table class="data-table fuel-table"><thead><tr><th>Placa</th><th>Gerente</th><th>Gerencia</th><th>Vehículo</th><th>Conductor asignado</th><th>Cargas</th><th>Litros</th><th>Gasto</th><th>Asignación</th><th>Diferencia</th><th>Estado</th></tr></thead><tbody>${rowHtml}<tr class="total-row"><td colspan="6">Total visible</td><td>${fmt(liters,2)} L</td><td>${money(spent)}</td><td>${money(budget)}</td><td class="${spent>budget?'negative':'positive'}">${spent>budget?"−":"+"}${money(Math.abs(budget-spent))}</td><td>${pill(`${over.length} sobregiro(s)`,over.length?"bad":"good")}</td></tr></tbody></table></div>
      <p class="table-caption">Diferencia = asignación semanal − gasto. Un valor negativo representa sobregiro. La captura compartida muestra más vehículos que los renglones visibles; esta tabla inicial reproduce las filas legibles.</p>
    </section>
    <section class="panel">${sectionHead("PLAN DE TRABAJO", "Recorridos programados desde el Excel")}
      ${plan.length ? `<div class="route-grid">${plan.map(p=>`<article class="route-card"><div><b>${esc(p.day)}</b><span>${esc(p.zone)}</span></div><p>${esc(p.route)}</p><small>${esc(p.distance)}</small></article>`).join("")}</div>` : emptyState("Plan de recorrido pendiente", "Cargá MULTIMEDIA.xlsx para incorporar la hoja COMBUSTIBLE.")}
    </section>
  `;
}

function renderRosters() {
  const multimedia = getImport("multimedia");
  const separateMultimedia = getImport("roster");
  const suroriente = getImport("suroriente");
  const sources = [
    { key:"operativo", title:"Roster del libro operativo Multimedia", file:multimedia?.filename, summary:multimedia?.summary?.roster, note:"La hoja de operaciones incluye también registros clasificados como BAJA; se muestran como filas del roster y no como plantilla activa." },
    { key:"multimedia", title:"Exportación MULTIMEDIA ROSTER", file:separateMultimedia?.filename, summary:separateMultimedia?.summary, note:"Conteo independiente del archivo anterior; no se suman ambos listados porque pueden corresponder a cortes o bases distintas." },
    { key:"suroriente", title:"Personal de Suroriente", file:suroriente?.filename, summary:suroriente?.summary, note:"Se excluyeron filas de encabezado de supervisores y vacantes. Solo se conservan conteos agrupados." }
  ];
  const panel = item => {
    if (!item.summary) return `<section class="panel">${sectionHead("ROSTER",item.title)}${emptyState("Archivo pendiente","Cargá la plantilla correspondiente desde Administración.")}</section>`;
    const total = item.summary.rosterTotal ?? item.summary.total ?? 0;
    const supervisors = item.summary.bySupervisor || [];
    const contracts = item.summary.byContract || [];
    const departments = item.summary.byDepartment || [];
    const max = Math.max(1,...supervisors.map(x=>n(x.count)));
    return `<section class="panel roster-panel">
      ${sectionHead("ESTRUCTURA COMERCIAL",item.title,`<span class="subtle-tag">${esc(item.file||"Archivo importado")}</span>`)}
      <div class="roster-total"><strong>${fmt(total)}</strong><span>registros de personal</span></div>
      <div class="content-grid two-col roster-content">
        <div><h3>Distribución por supervisor</h3><div class="rank-list">${supervisors.map(x=>`<div class="rank-row"><div><b>${esc(x.name)}</b><span>${fmt(x.count)}</span></div>${progress(ratio(x.count,max),"blue")}</div>`).join("")||`<p class="muted">No hay agrupación por supervisor.</p>`}</div></div>
        <div><h3>Tipo de contrato</h3><div class="roster-tags">${contracts.map(x=>pill(`${x.name}: ${fmt(x.count)}`,"blue-soft")).join("")||`<span class="muted">No disponible</span>`}</div>${departments.length?`<h3>Departamento</h3><div class="roster-tags">${departments.map(x=>pill(`${x.name}: ${fmt(x.count)}`,"neutral")).join("")}</div>`:""}</div>
      </div><p class="table-caption">${esc(item.note||"")}</p>
    </section>`;
  };
  return `<div class="page-heading"><div><div class="eyebrow">FUERZA COMERCIAL</div><h1>Estructura de equipos</h1><p>Conteos por supervisor, contrato y departamento a partir de los rosters cargados.</p></div><div class="heading-chip">Datos agregados · sin información bancaria ni de identificación</div></div>
    <div class="note-strip">Los archivos de roster se presentan por separado. No se suman entre sí para evitar duplicar personal cuando existen cortes distintos.</div>
    <div class="roster-stack">${sources.map(panel).join("")}</div>`;
}

async function renderAdminExtras() {
  if (currentUser?.role !== "admin") return "";
  let history=[], users=[], audit=[];
  try { [history,users,audit]=await Promise.all([api("/api/admin/history"),api("/api/admin/users"),api("/api/admin/audit")]); } catch(e) {}
  return `
    <div class="admin-grid">
      <section class="panel">${sectionHead("CARGA DE DATOS", "Actualizar con Excel")}
        <p class="muted">Podés cargar varios libros a la vez. El sistema detecta la plantilla, agrupa sus datos y actualiza el módulo correspondiente. No conserva el archivo original después de importarlo.</p>
        <form id="uploadForm" class="upload-zone"><div class="upload-symbol">↑</div><b>Arrastrá tus archivos .xlsx aquí</b><span>o seleccioná desde tu computadora · máximo 25 MB por carga</span><input id="excelFiles" type="file" accept=".xlsx" multiple required><button class="btn btn-primary" type="submit">Analizar e importar</button></form>
        <div id="uploadProgress" class="upload-progress"></div>
      </section>
      <section class="panel">${sectionHead("SEGURIDAD", "Cambiar mi contraseña")}
        <form id="passwordForm" class="stack-form"><label>Contraseña actual<input name="oldPassword" type="password" required></label><label>Nueva contraseña<input name="newPassword" type="password" minlength="8" required placeholder="Mínimo 8 caracteres"></label><button class="btn btn-outline" type="submit">Actualizar contraseña</button></form>
        <div class="security-note">La contraseña se guarda como hash, no como texto visible. No uses la clave inicial en un servidor público.</div>
      </section>
      <section class="panel admin-wide">${sectionHead("HISTORIAL", "Archivos procesados")}
        <div class="table-wrap"><table class="data-table"><thead><tr><th>Archivo</th><th>Módulo</th><th>Filas</th><th>Fecha de importación</th></tr></thead><tbody>${history.map(h=>`<tr><td>${esc(h.filename)}</td><td>${pill(h.data_type,"blue-soft")}</td><td>${fmt(h.row_count)}</td><td>${esc((h.imported_at||"").replace("T"," ").replace("+00:00"," UTC"))}</td></tr>`).join("")||`<tr><td colspan="4">No hay importaciones.</td></tr>`}</tbody></table></div>
      </section>
      <section class="panel">${sectionHead("CONTROL DE ACCESO", "Crear usuario")}
        <form id="userForm" class="stack-form"><label>Nombre de usuario<input name="username" minlength="3" maxlength="40" required placeholder="ej. supervisor01"></label><label>Contraseña inicial<input name="password" type="password" minlength="8" required placeholder="Mínimo 8 caracteres"></label><label>Permiso<select name="role"><option value="viewer">Consulta</option><option value="admin">Administrador</option></select></label><button class="btn btn-primary" type="submit">Crear usuario</button></form>
      </section>
      <section class="panel">${sectionHead("USUARIOS", "Permisos configurados")}
        <div class="user-list">${users.map(u=>`<form class="user-row user-edit-form" data-user-edit="${esc(u.username)}"><div class="avatar mini">${esc(u.username.slice(0,2).toUpperCase())}</div><div class="user-row-ident"><b>${esc(u.username)}</b><span>Creado: ${esc((u.created_at||"").slice(0,10))}</span></div><select name="role"><option value="viewer" ${u.role==="viewer"?"selected":""}>Consulta</option><option value="admin" ${u.role==="admin"?"selected":""}>Admin</option></select><select name="active"><option value="true" ${u.active?"selected":""}>Activo</option><option value="false" ${!u.active?"selected":""}>Desactivado</option></select><button class="btn btn-outline btn-xs" type="submit">Guardar</button></form>`).join("")}</div>
      </section>
      <section class="panel admin-wide">${sectionHead("TRAZABILIDAD", "Actividad reciente")}
        <div class="audit-list">${audit.slice(0,8).map(a=>`<div><b>${esc(a.action)}</b><span>${esc(a.username)} · ${esc(a.created_at||"")}</span><small>${esc(a.details||"")}</small></div>`).join("")||"Sin actividad registrada."}</div>
      </section>
    </div>
  `;
}

async function renderAdmin() {
  const imports=appState.imports||[];
  const adminExtras=await renderAdminExtras();
  return `
    <div class="page-heading"><div><div class="eyebrow">CONFIGURACIÓN DEL SISTEMA</div><h1>Administración</h1><p>Importación de archivos, edición de indicadores y administración de accesos.</p></div><div class="heading-chip">${currentUser?.role==="admin"?"Administrador activo":"Solo lectura"}</div></div>
    ${currentUser?.role!=="admin"?emptyState("Acceso de consulta","Tu usuario no tiene permisos para modificar el sistema."):""}
    ${currentUser?.role==="admin"?`<section class="panel edit-explainer">${sectionHead("EDICIÓN DIRECTA", "Modificar los valores de los tableros", `<button class="btn btn-primary" id="enableEditFromAdmin">${editMode?"Cerrar edición":"Activar edición"}</button>`)}<p class="muted">Activá el modo edición desde el botón superior o desde aquí. Los campos numéricos y las tablas principales se vuelven editables; después guardá los cambios para persistirlos en la base local.</p><div class="edit-targets"><span>Dashboard gerencial</span><span>Metas Multimedia</span><span>Supervisores</span><span>Combustible por placa</span></div></section>${adminExtras}`:""}
    <section class="panel">${sectionHead("LIBROS RECONOCIDOS", "Plantillas y módulos")}
      <div class="template-grid">${imports.map(i=>`<article class="template-item"><div class="template-icon">▤</div><div><b>${esc(i.filename)}</b><span>${esc(i.type)} · ${fmt(i.rows)} filas · ${(i.sheets||[]).length} hojas</span></div>${pill(i.sample?"Ejemplo":"Actualizado",i.sample?"neutral":"good")}</article>`).join("")}</div>
    </section>
  `;
}

async function renderPage() {
  if (!appState) return;
  $("#pageCrumb").textContent = pageTitles[currentPage] || "Dashboard";
  $$(".nav-item").forEach(el=>el.classList.toggle("active",el.dataset.page===currentPage));
  let html="";
  if (currentPage==="overview") html=renderOverview();
  if (currentPage==="multimedia") html=renderMultimedia();
  if (currentPage==="rosters") html=renderRosters();
  if (currentPage==="conecta") html=renderConecta();
  if (currentPage==="solicitudes") html=renderSolicitudes();
  if (currentPage==="fuel") html=renderFuel();
  if (currentPage==="admin") html=await renderAdmin();
  $("#pageContent").innerHTML=html;
  bindPageActions();
  updateEditButton();
}

function updateEditButton() {
  const editBtn=$("#editToggle");
  const isAdmin=currentUser?.role==="admin";
  editBtn.classList.toggle("hidden",!isAdmin || currentPage==="admin");
  editBtn.textContent=editMode?"Guardar cambios ✓":"✎ Editar datos";
  editBtn.classList.toggle("btn-primary",editMode);
  editBtn.classList.toggle("btn-outline",!editMode);
}
function setPath(obj,path,value) {
  const parts=path.split("."); let target=obj;
  for(let i=0;i<parts.length-1;i++){const key=/^\d+$/.test(parts[i])?Number(parts[i]):parts[i]; if(target[key]===undefined)return; target=target[key];}
  const last=parts[parts.length-1]; const key=/^\d+$/.test(last)?Number(last):last;
  target[key]=value;
}
function syncEditableInputs() {
  $$('[data-path]').forEach(el=>{
    const raw=el.value;
    const value=el.type==="number" ? (raw===""?0:Number(raw)) : raw;
    setPath(appState,el.dataset.path,value);
  });
}
async function saveEdits() {
  syncEditableInputs();
  try { const result=await api("/api/admin/state",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(appState)}); appState=result.state; editMode=false; await renderPage(); toast("Cambios guardados correctamente"); }
  catch(e){toast(e.message,"error");}
}

function bindPageActions() {
  $$('[data-page]').forEach(el=>el.addEventListener("click",()=>navigate(el.dataset.page)));
  $$('[data-scroll]').forEach(el=>el.addEventListener("click",()=>$(`#${el.dataset.scroll}`)?.scrollIntoView({behavior:"smooth",block:"start"})));
  const formulaForm=$("#formulaForm");
  if(formulaForm) formulaForm.addEventListener("submit",async e=>{
    e.preventDefault(); const values=Object.fromEntries(new FormData(formulaForm).entries());
    try { const result=await api("/api/formulas/daily",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(values)}); const completion=result.completion===null?"N/D":pct(result.completion*100); $("#formulaResult").innerHTML=`<span>Resultado ponderado</span><b>${fmt(result.weightedProducts,2)}</b><span>Déficit: ${fmt(result.deficit,2)} · Cumplimiento: ${completion} · Motor: ${esc(result.engine)}</span>`; }
    catch(err){toast(err.message,"error");}
  });
  const uploadForm=$("#uploadForm");
  if(uploadForm) uploadForm.addEventListener("submit",async e=>{
    e.preventDefault(); const files=$("#excelFiles").files; if(!files.length)return;
    const formData=new FormData(); [...files].forEach(file=>formData.append("files",file));
    $("#uploadProgress").textContent="Analizando libros y fórmulas…";
    try { const result=await api("/api/admin/upload",{method:"POST",body:formData}); appState=result.state; $("#uploadProgress").textContent=result.imported.map(x=>`${x.filename}: ${fmt(x.rows)} filas · ${x.type}`).join(" | "); toast(`${result.imported.length} archivo(s) importado(s)`); await renderPage(); }
    catch(err){$("#uploadProgress").textContent=err.message;toast(err.message,"error");}
  });
  const userForm=$("#userForm");
  if(userForm) userForm.addEventListener("submit",async e=>{
    e.preventDefault(); const body=Object.fromEntries(new FormData(userForm).entries());
    try { await api("/api/admin/users",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)}); toast("Usuario creado"); await renderPage(); }
    catch(err){toast(err.message,"error");}
  });
  $$('[data-user-edit]').forEach(form=>form.addEventListener("submit",async e=>{
    e.preventDefault(); const body=Object.fromEntries(new FormData(form).entries()); body.active=body.active==="true";
    try { await api(`/api/admin/users/${encodeURIComponent(form.dataset.userEdit)}`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)}); toast("Permisos actualizados"); await renderPage(); }
    catch(err){toast(err.message,"error");}
  }));
  const passwordForm=$("#passwordForm");
  if(passwordForm) passwordForm.addEventListener("submit",async e=>{
    e.preventDefault(); const body=Object.fromEntries(new FormData(passwordForm).entries());
    try { await api("/api/admin/change-password",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)}); passwordForm.reset(); toast("Contraseña actualizada"); }
    catch(err){toast(err.message,"error");}
  });
  const enableEdit=$("#enableEditFromAdmin");
  if(enableEdit) enableEdit.addEventListener("click",()=>{editMode=!editMode; updateEditButton(); toast(editMode?"Modo de edición activado":"Modo de edición cerrado");});
}

function navigate(page) {
  if(!pageTitles[page]) return;
  currentPage=page;
  if(page!=="admin" && editMode){ editMode=false; }
  renderPage();
}
async function loadState() {
  const result=await api("/api/state");
  appState=result.state; currentUser=result.user;
  $("#loginScreen").classList.add("hidden"); $("#appShell").classList.remove("hidden");
  $("#userName").textContent=currentUser.username;
  $("#userRole").textContent=currentUser.role==="admin"?"Administrador":"Consulta";
  $("#userAvatar").textContent=currentUser.username.slice(0,2).toUpperCase();
  $(".admin-nav").classList.toggle("hidden",currentUser.role!=="admin");
  $("#topbarDate").textContent=appState.period?.label||"Período actual";
  $("#dateStart").value=appState.period?.start||"";
  $("#dateEnd").value=appState.period?.end||"";
  $("#managementFilter").value=appState.period?.management||"Pacífico";
  currentPage="overview"; editMode=false;
  updatePeriodLabel();
  await renderPage();
}
function updatePeriodLabel() {
  const start=$("#dateStart").value; const end=$("#dateEnd").value; const management=$("#managementFilter").value;
  const dateFmt=x=>x?x.split("-").reverse().join("/"):"—";
  $("#periodLabel").textContent=`${dateFmt(start)} — ${dateFmt(end)}`;
  $("#filterChip").textContent=`✓ Filtro activo · ${management}`;
}

$("#loginForm").addEventListener("submit",async e=>{
  e.preventDefault(); $("#loginError").textContent="";
  try { await api("/api/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({username:$("#loginUsername").value,password:$("#loginPassword").value})}); await loadState(); }
  catch(err){$("#loginError").textContent=err.message;}
});
$("#logoutBtn").addEventListener("click",async()=>{try{await api("/api/logout",{method:"POST"});}catch(e){} location.reload();});
$("#editToggle").addEventListener("click",async()=>{
  if(editMode){await saveEdits();}
  else {editMode=true; await renderPage(); toast("Modo de edición activado. Modificá los campos y guardá.");}
});
$("#applyFilter").addEventListener("click",()=>{
  appState.period.start=$("#dateStart").value; appState.period.end=$("#dateEnd").value; appState.period.management=$("#managementFilter").value;
  updatePeriodLabel(); toast("Filtro visual actualizado. Los Excel deben cargarse para recalcular períodos distintos.");
});
$("#resetFilter").addEventListener("click",()=>{
  $("#dateStart").value=appState.period.start; $("#dateEnd").value=appState.period.end; $("#managementFilter").value=appState.period.management; updatePeriodLabel();
});

// Attempt to restore an active session after a page refresh.
api("/api/state").then(async result=>{
  appState=result.state; currentUser=result.user;
  $("#loginScreen").classList.add("hidden"); $("#appShell").classList.remove("hidden");
  $("#userName").textContent=currentUser.username; $("#userRole").textContent=currentUser.role==="admin"?"Administrador":"Consulta"; $("#userAvatar").textContent=currentUser.username.slice(0,2).toUpperCase();
  $(".admin-nav").classList.toggle("hidden",currentUser.role!=="admin");
  $("#topbarDate").textContent=appState.period?.label||"Período actual"; $("#dateStart").value=appState.period?.start||""; $("#dateEnd").value=appState.period?.end||""; $("#managementFilter").value=appState.period?.management||"Pacífico"; updatePeriodLabel(); await renderPage();
}).catch(()=>{});
