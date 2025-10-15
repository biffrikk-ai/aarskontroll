const { useState, useEffect, useMemo } = React;
const { jsPDF } = window.jspdf;

/*** Helpers ***/
const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36);
const TODAY = () => new Date().toISOString().slice(0,10);
const LS_KEY = "aarskontroll_webstore_v15";

function slugify(s) {
  return String(s || '')
    .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
}
function shortId(id) {
  return String(id || '').replace(/[^a-z0-9]/gi,'').slice(-6) || Math.random().toString(36).slice(2,8);
}
function makeReportFilename({ date, customerName, individualName, type, serial, id }) {
  const d = (date || '').replace(/[^0-9]/g,'');
  const parts = [
    'aarskontroll',
    slugify(cleanProductName(type || 'produkt')),
    slugify(customerName || 'kunde'),
    slugify(individualName || 'individ'),
    serial ? slugify(serial) : null,
    d || null,
    shortId(id)
  ].filter(Boolean);
  let base = parts.join('_').slice(0, 110);
  return `${base}.pdf`; 
}
function cleanProductName(typeText = '') {
  return String(typeText)
    .replace(/EN\s*\d+(\s*\/\s*EN\d+)*/gi, '')
    .replace(/[–-]\s*/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}
function sameDay(isoA, isoB) { return String(isoA||'').slice(0,10) === String(isoB||'').slice(0,10); }
function customerIndividuals(store, customerId) { return store.individuals.filter(i => i.customerId === customerId).map(i=>i.id); }
function collectChecksForCustomerDate(store, customerId, isoDate) {
  const indIds = new Set(customerIndividuals(store, customerId));
  return store.yearchecks.filter(c => indIds.has(c.individualId) && sameDay(c.date, isoDate)).sort((a,b)=>a.date.localeCompare(b.date));
}

function wrapLines(doc, text, maxWidth) {
  const words = String(text||'').split(/\s+/); const lines=[]; let line='';
  for (const w of words) { const t=line?line+' '+w:w; if (doc.getTextWidth(t)>maxWidth){ if(line)lines.push(line); line=w; } else line=t; }
  if (line) lines.push(line); return lines;
}
function drawCellRect(doc, x, y, w, h, opts = {}) {
  const { fill = false, stroke = true } = opts;
  if (fill && stroke) doc.rect(x, y, w, h, 'FD');
  else if (fill) doc.rect(x, y, w, h, 'F');
  else if (stroke) doc.rect(x, y, w, h, 'S');
}
function textInCell(doc, text, x, y, w, h, lineHeight) {
  const lines = wrapLines(doc, text, w - 6);
  let ty = y + 12;
  for (const ln of lines) { doc.text(ln, x + 3, ty); ty += lineHeight; }
  return Math.max(h, 12 + lines.length * lineHeight);
}
function drawFooterAndWatermark(doc, pageW, pageH, margin){
  const footerY = pageH - 50;
  doc.setLineWidth(0.5); doc.setDrawColor(200); doc.line(margin, footerY, pageW - margin, footerY);
  doc.setFontSize(11);
  const FOOTER_LINES = [
    'Petersson Industri og Service',
    'Smed Qvales vei 19b, 8012 Bodø',
    'Tlf: +47 911 28 084   –   E-post: bjorn.petersson@outlook.com',
    'Org.nr: 933 939 871 MVA'
  ];
  let fy = footerY + 14; FOOTER_LINES.forEach(line => { doc.text(line, margin, fy); fy += 14; });
  const WM = '© 2025 Petersson Industri og Service – Smed Qvales vei 19b, 8012 Bodø – Org.nr: 933 939 871 MVA';
  doc.setFontSize(10); doc.setTextColor(130);
  const wmWidth = doc.getTextWidth(WM);
  doc.text(WM, (pageW - wmWidth)/2, pageH - 10);
  doc.setTextColor(0);
}

/*** Store ***/
const defaultStore = { customers: [], individuals: [], yearchecks: [], items: [] };
const loadStore = () => { try { return JSON.parse(localStorage.getItem(LS_KEY) || "{}"); } catch { return {}; } };
const saveStore = (data) => localStorage.setItem(LS_KEY, JSON.stringify(data));

/*** EN Checklists ***/
const CHECKLISTS = {
  en361_en358_en813: [
    { key: 'merking', label: 'Merkelapp/identifikasjon lesbar – samsvarer med EN361/EN358/EN813' },
    { key: 'webbing', label: 'Bånd og stropper uten kutt, rifter, oppflising, slitasje eller misfarging' },
    { key: 'sømmer', label: 'Sømmer intakte, ingen løse tråder eller opprevet materiale' },
    { key: 'fester', label: 'D-ringer, spenner og beslag uten rust, deformasjon eller skarpe kanter' },
    { key: 'justering', label: 'Alle justeringspunkter fungerer og holder posisjon under belastning' },
    { key: 'komfort', label: 'Polstring og festepunkter i god stand – ingen hardhet eller stivhet' },
    { key: 'etikett', label: 'Produsentens etikett/sertifisering synlig og lesbar' },
    { key: 'rengjøring', label: 'Utstyret er rent, tørt og korrekt lagret uten kjemikaliepåvirkning' },
    { key: 'avvik', label: 'Ingen tegn til overbelastning, fall eller uautorisert modifikasjon' },
  ],
  en355: [
    { key: 'merking', label: 'Merkelapp/ID/WLL lesbar og samsvarer med EN355' },
    { key: 'fangdel', label: 'Falldemperen ikke utløst, uten rifter eller forlengelse' },
    { key: 'line', label: 'Tau/bånd uten kutt, slitasje, oppflising, UV- eller kjemisk skade' },
    { key: 'søm', label: 'Sømmer og termineringer hele, uten opprevet tråd' },
    { key: 'koblinger', label: 'Karabiner/kroker fungerer, lukker korrekt og ikke rustne/deformerte' },
    { key: 'indikator', label: 'Visuell fallindikator ikke aktivert' },
    { key: 'merking_fall', label: 'Fallindikator synlig og korrekt merket' },
    { key: 'bruk', label: 'Lengde og type passer bruksområdet' },
  ],
  en360: [
    { key: 'merking', label: 'Merkelapp synlig og lesbar – EN360' },
    { key: 'hus', label: 'Hus uten sprekker, deformasjon eller synlig skade' },
    { key: 'wire', label: 'Wire/bånd uten rust, oppflising, kutt eller bøying' },
    { key: 'innspoling', label: 'Innspoling jevn, uten rykk eller friksjonsstøy' },
    { key: 'brems', label: 'Bremsemekanisme fungerer og løser ut normalt ved trekkprøve' },
    { key: 'krok', label: 'Krok med sikkerhetslås fungerer og ikke deformert' },
    { key: 'fallindikator', label: 'Fallindikator viser ikke utløsning' },
    { key: 'merking_kontroll', label: 'Siste kontrollmerke og dato oppdatert' },
  ],
  en353_2: [
    { key: 'merking', label: 'Merkelapp og produsentinfo lesbar – EN353-2' },
    { key: 'wire_tau', label: 'Wire/tau uten kutt, slitasje, oppflising, rust eller misfarging' },
    { key: 'løpeenhet', label: 'Løpevogn beveger seg fritt og låser ved falltest' },
    { key: 'koblinger', label: 'Koblingspunkter og kroker fungerer og er kompatible' },
    { key: 'forankring', label: 'Forankringspunkt korrekt montert og uten skade' },
    { key: 'terminering', label: 'Endefester intakte, ikke rustne, ingen deformasjon' },
    { key: 'systemkomp', label: 'Systemet er komplett iht. produsentens spesifikasjon' },
  ],
  en358: [
    { key: 'merking', label: 'Merkelapp/ID samsvarer med EN358' },
    { key: 'tau_belte', label: 'Tau/belte uten skader, kutt, rifter, UV- eller kjemisk påvirkning' },
    { key: 'justering', label: 'Justeringsmekanismer fungerer og holder posisjon' },
    { key: 'kobling', label: 'Kroker og karabiner lukker og låser korrekt' },
    { key: 'sømm', label: 'Sømmer og termineringer uten skade' },
    { key: 'bruk', label: 'Bruksområde og merking samsvarer med bruk' },
  ],
  en354: [
    { key: 'merking', label: 'Merkelapp lesbar – EN354' },
    { key: 'tau', label: 'Tau uten kutt, rifter, UV- eller kjemisk skade' },
    { key: 'terminering', label: 'Endefester/sømmer intakte, ikke deformert' },
    { key: 'koblinger', label: 'Kroker fungerer og lukker korrekt' },
    { key: 'lengde', label: 'Lengde og type samsvarer med bruksområde' },
  ],
  en795: [
    { key: 'merking', label: 'Merkelapp og produsentinfo lesbar – EN795' },
    { key: 'struktur', label: 'Forankringspunkt fast og uten sprekker, rust eller deformasjon' },
    { key: 'festemidler', label: 'Bolter og fester stramme og uten korrosjon' },
    { key: 'bevegelse', label: 'Bevegelige deler fungerer fritt' },
    { key: 'plassering', label: 'Plassering korrekt i forhold til arbeidssituasjon' },
    { key: 'kapasitet', label: 'Kapasitet/WLL iht. produsentens dokumentasjon' },
  ],
  en362: [
    { key: 'merking', label: 'Merkelapp/merking lesbar – EN362' },
    { key: 'lås', label: 'Låsemekanisme fungerer – åpner/lukker korrekt' },
    { key: 'fjær', label: 'Fjærspenning normal – lukker automatisk' },
    { key: 'deformasjon', label: 'Ingen rust, riper eller deformasjoner' },
    { key: 'funksjon', label: 'Koblingsstykke fungerer smidig uten fastklemming' },
  ],
  en341: [
    { key: 'merking', label: 'Merkelapp/sertifikat lesbar – EN341' },
    { key: 'hus_mekanisme', label: 'Hus/mekanisme uten skade, sprekker eller korrosjon' },
    { key: 'tau_wire', label: 'Tau/wire uten skader, rifter eller knekk' },
    { key: 'brems', label: 'Bremsemekanisme fungerer under test' },
    { key: 'koblinger', label: 'Kroker/karabiner intakte og funksjonelle' },
    { key: 'lengde', label: 'Lengde samsvarer med spesifikasjon' },
    { key: 'merking_dato', label: 'Kontrolldato oppdatert' },
  ],
};

const toChecklistKey = (type = "") => {
  const t = String(type).toLowerCase();
  if (t.includes('361') || t.includes('358') || t.includes('813') || t.includes('sele')) return 'en361_en358_en813';
  if (t.includes('355') || t.includes('fangline') || t.includes('falldemper')) return 'en355';
  if (t.includes('360') || t.includes('fallblokk')) return 'en360';
  if (t.includes('353') || t.includes('vertikal') || t.includes('takarbeids') || t.includes('takline')) return 'en353_2';
  if (t.includes('358') && !t.includes('sele')) return 'en358';
  if (t.includes('354') || t.includes('forbindelsesline')) return 'en354';
  if (t.includes('795') || t.includes('forankring')) return 'en795';
  if (t.includes('362') || t.includes('karabiner') || t.includes('kobling')) return 'en362';
  if (t.includes('341') || t.includes('redning') || t.includes('nedfiring')) return 'en341';
  return null;
};

/*** UI Components ***/
const Input = (props) => <input {...props} className={"input " + (props.className||"")} />;
const Button = ({children, ...p}) => <button {...p} className={"btn " + (p.className||"")}>{children}</button>;
const Card = ({title, children, actions}) => (
  <div className="card">
    {title && <div style={{fontWeight:700, fontSize:16, marginBottom:8}}>{title}</div>}
    {children}
    {actions && <div className="mt12" style={{display:'flex', gap:8}}>{actions}</div>}
  </div>
);

/*** Pages ***/
function CustomersPage({ store, onPickCustomer }) {
  return (
    <div className="row mt12">
      <Card title="Kundeliste">
        {store.customers.length===0 && <div className="small">Ingen kunder enda.</div>}
        {store.customers.map(c => (
          <div key={c.id} className="card mt8" style={{padding:10,cursor:'pointer'}}
               onClick={()=>onPickCustomer(c)}>
            <div style={{fontWeight:600}}>{c.name}</div>
            <div className="small">Org.nr: {c.orgnr || '-'}</div>
            <div className="small">{c.contact} {c.phone}</div>
          </div>
        ))}
      </Card>

      <Card title="Ny kunde">
        <NewCustomerForm />
      </Card>
    </div>
  );
}

function CustomerDetailPage({ store, customer, bundleDate, onChangeBundleDate, onBack, onNewCheck, onOpenReports, onBundle, onBundleEmail, onEmailJS }) {
  const inds = store.individuals.filter(i=>i.customerId===customer.id);
  return (
    <div className="row mt12">
      <Card title={`Kunde: ${customer.name}`} actions={<Button onClick={onBack}>Tilbake</Button>}>
        <div className="small">{customer.address}</div>
        <div className="small">{customer.contact} · {customer.phone} · {customer.email}</div>
        <div className="small">Org.nr: {customer.orgnr || '-'}</div>

        <div className="mt12" style={{display:'grid', gridTemplateColumns:'1fr auto auto auto', gap:8}}>
          <div>
            <div className="label">Dato for rapportbunke</div>
            <input className="input" type="date" value={bundleDate} onChange={e=>onChangeBundleDate(e.target.value)} />
          </div>
          <Button onClick={()=>onBundle(customer, bundleDate)}>Last ned samlet PDF</Button>
          <Button onClick={()=>onBundleEmail(customer, bundleDate)}>Åpne e-post (mailto)</Button>
          <Button onClick={()=>onEmailJS(customer, bundleDate)}>Send via EmailJS</Button>
        </div>
      </Card>

      <Card title="Individer">
        {inds.length===0 && <div className="small">Ingen individer registrert.</div>}
        {inds.map(i => (
          <div key={i.id} className="card mt8" style={{padding:12}}>
            <div style={{fontWeight:600}}>{i.name}</div>
            <div className="small">{i.type} {i.serial?`- ${i.serial}`:''}</div>
            <div className="mt8" style={{display:'flex', gap:8}}>
              <Button onClick={()=>onOpenReports(i)}>Se rapporter</Button>
              <Button onClick={()=>onNewCheck(i)}>Ny årskontroll</Button>
            </div>
          </div>
        ))}
      </Card>
    </div>
  );
}

function ReportsPage({ store, individual, onBack, exportPdf, sendEmail }) {
  const list = store.yearchecks
    .filter(c=>c.individualId===individual.id)
    .sort((a,b)=>b.date.localeCompare(a.date));
  return (
    <div className="row mt12">
      <Card title={`Rapporter – ${individual.name}`} actions={<Button onClick={onBack}>Tilbake</Button>}>
        {list.length===0 && <div className="small">Ingen rapporter ennå.</div>}
        {list.map(ch => (
          <div key={ch.id} className="card mt8" style={{padding:10}}>
            <div style={{fontWeight:600}}>{ch.date} – {ch.result}</div>
            <div className="small">{ch.inspector}</div>
            <div className="mt8" style={{display:'flex', gap:8}}>
              <Button onClick={()=>exportPdf(ch)}>Eksporter PDF</Button>
              <Button onClick={()=>{ exportPdf(ch); sendEmail(ch); }}>Send e-post</Button>
            </div>
          </div>
        ))}
      </Card>
    </div>
  );
}

function NewCheckPage({
  individual, checkForm, setCheckForm, checkItems, setCheckItems,
  startChecklist, saveYearcheck, onBack
}) {
  return (
    <div className="row mt12">
      <Card title={`Ny årskontroll – ${individual ? cleanProductName(individual.type) + ' – ' + (individual.name || '') : ''}`}
            actions={<><Button onClick={onBack}>Avbryt</Button><Button onClick={saveYearcheck}>Lagre kontroll</Button></>}>
        {!individual && <div className="small" style={{color:'#b91c1c'}}>Velg individ først.</div>}
        <div className="row">
          <div>
            <div className="label">Dato</div>
            <Input type="date" value={checkForm.date} onChange={e=>setCheckForm({...checkForm, date:e.target.value})} />
          </div>
          <div>
            <div className="label">Kontrollør</div>
            <Input value={checkForm.inspector} onChange={e=>setCheckForm({...checkForm, inspector:e.target.value})} />
          </div>
        </div>
        <div className="row">
          <div>
            <div className="label">Resultat</div>
            <select className="input" value={checkForm.result} onChange={e=>setCheckForm({...checkForm, result:e.target.value})}>
              <option>OK</option>
              <option>Avvik</option>
            </select>
          </div>
        </div>
        <div className="mt8">
          <div className="label">Notater</div>
          <textarea className="input" rows="3" value={checkForm.notes} onChange={e=>setCheckForm({...checkForm, notes:e.target.value})}></textarea>
        </div>
        <div className="mt8" style={{display:'flex', gap:8}}>
          <Button type="button" onClick={startChecklist}>Last sjekkliste fra type</Button>
        </div>

        {checkItems.length>0 && (
          <div className="card mt12">
            <div style={{fontWeight:600, marginBottom:8}}>Sjekkliste</div>
            {checkItems.map((it, idx) => (
              <div key={it.key} className="card mt8" style={{padding:10}}>
                <div className="small" style={{fontWeight:600, color:'#111'}}>{it.label}</div>
                <div className="mt8">
                  {['OK','Avvik','NA'].map(opt => (
                    <button key={opt} className={"badge "+(it.status===opt?'active':'')}
                            onClick={()=>setCheckItems(prev=>prev.map((p,i)=>i===idx?{...p, status:opt}:p))}>
                      {opt}
                    </button>
                  ))}
                </div>
                <input className="input mt8" placeholder="Notat (valgfritt)" value={it.notes}
                       onChange={e=>setCheckItems(prev=>prev.map((p,i)=>i===idx?{...p, notes:e.target.value}:p))} />
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

/*** Forms ***/
function NewCustomerForm(){
  const [custForm, setCustForm] = React.useState({name:'', address:'', contact:'', phone:'', email:'', orgnr:''});
  const {store, setStore} = React.useContext(StoreCtx);
  const addCustomer = () => {
    if (!custForm.name.trim()) return alert('Kundenavn må fylles ut');
    const c = { id: uid(), ...custForm };
    setStore(s => ({...s, customers: [...s.customers, c]}));
    setCustForm({name:'', address:'', contact:'', phone:'', email:'', orgnr:''});
  };
  return (
    <div>
      <div className="mt8">
        <div className="label">Kundenavn</div>
        <Input value={custForm.name} onChange={e=>setCustForm({...custForm, name:e.target.value})} />
      </div>
      <div className="mt8">
        <div className="label">Adresse</div>
        <Input value={custForm.address} onChange={e=>setCustForm({...custForm, address:e.target.value})} />
      </div>
      <div className="row">
        <div>
          <div className="label">Kontaktperson</div>
          <Input value={custForm.contact} onChange={e=>setCustForm({...custForm, contact:e.target.value})} />
        </div>
        <div>
          <div className="label">Telefon</div>
          <Input value={custForm.phone} onChange={e=>setCustForm({...custForm, phone:e.target.value})} />
        </div>
      </div>
      <div className="row">
        <div>
          <div className="label">E-post</div>
          <Input value={custForm.email} onChange={e=>setCustForm({...custForm, email:e.target.value})} />
        </div>
        <div>
          <div className="label">Org.nr</div>
          <Input value={custForm.orgnr} onChange={e=>setCustForm({...custForm, orgnr:e.target.value})} />
        </div>
      </div>
      <div className="mt12"><Button onClick={addCustomer}>Lagre kunde</Button></div>
    </div>
  );
}

/*** Context for store ***/
const StoreCtx = React.createContext(null);

/*** Main App ***/
function App(){
  const [store, setStore] = useState(() => ({...defaultStore, ...loadStore()}));
  useEffect(() => { saveStore(store); }, [store]);

  const [view, setView] = useState('customers'); // 'customers' | 'customerDetail' | 'reports' | 'newCheck'
  const [currentCustomer, setCurrentCustomer] = useState(null);
  const [currentIndividual, setCurrentIndividual] = useState(null);

  const [indForm, setIndForm] = useState({name:'', type:'', serial:'', notes:''});
  const [checkForm, setCheckForm] = useState({date:TODAY(), inspector:'', result:'OK', notes:''});
  const [checkItems, setCheckItems] = useState([]);
  const [bundleDate, setBundleDate] = useState(TODAY());

  const individuals = useMemo(() => store.individuals.filter(i => i.customerId === currentCustomer?.id), [store.individuals, currentCustomer]);

  const addIndividual = () => {
    if (!currentCustomer) return alert('Velg kunde først');
    if (!indForm.name.trim()) return alert('Navn må fylles ut');
    if (!indForm.type) return alert('Velg type produkt');
    const ind = { id: uid(), customerId: currentCustomer.id, ...indForm };
    setStore(s => ({...s, individuals: [...s.individuals, ind]}));
    setIndForm({name:'', type:'', serial:'', notes:''});
  };

  const startChecklist = () => {
    if (!currentIndividual) return alert('Velg individ');
    const key = toChecklistKey(currentIndividual.type);
    const base = key && CHECKLISTS[key] ? CHECKLISTS[key] : [];
    setCheckItems(base.map(i => ({...i, status:'OK', notes:''})));
    setCheckForm({date:TODAY(), inspector:'', result:'OK', notes:''});
  };

  const addOneYear = (iso) => { try { const d = new Date(iso); d.setFullYear(d.getFullYear()+1); return d.toISOString().slice(0,10); } catch { return iso; } };
  const itemsForCheck = (id) => store.items.filter(i => i.yearcheckId === id);

  const saveYearcheck = () => {
    if (!currentIndividual) return alert('Velg individ');
    const y = { id: uid(), individualId: currentIndividual.id, ...checkForm, nextDate: addOneYear(checkForm.date) };
    const items = (checkItems||[]).map(ci => ({ id: uid(), yearcheckId: y.id, itemKey: ci.key, label: ci.label, status: ci.status, notes: ci.notes }));
    setStore(s => ({...s, yearchecks:[y, ...s.yearchecks], items:[...s.items, ...items]}));
  };

  const exportPdf = (check) => {
    const doc = new jsPDF({ unit:'pt', format:'a4' });
    const margin = 40, lineH = 18, pageW = doc.internal.pageSize.getWidth(), pageH = doc.internal.pageSize.getHeight();
    let y = margin;

    const indiv = currentIndividual || store.individuals.find(i => i.id === check.individualId);
    const cust  = currentCustomer || (indiv ? store.customers.find(c => c.id === indiv.customerId) : null);
    const typeTitle = cleanProductName(indiv?.type || 'Produkt');

    doc.setFontSize(16); doc.text(`${typeTitle} – årskontroll`, margin, y); y += 26;
    doc.setFontSize(11);
    const field = (label,val)=>{ doc.text(`${label}: ${val||''}`, margin, y); y += lineH; };
    field('Kunde', cust?.name || '');
    field('Individ', indiv ? `${indiv.name}${indiv.serial ? ' – ' + indiv.serial : ''}` : '');
    field('Dato', check.date);
    field('Kontrollør', check.inspector);
    field('Resultat', check.result);
    if (check.notes){ doc.text('Notater:', margin, y); y += lineH; for (const ln of wrapLines(doc, check.notes, pageW - margin*2)) { doc.text(ln, margin, y); y += lineH; } }
    if (check.nextDate){ y += 6; field('Neste kontroll', check.nextDate); }

    y += 8; doc.setFontSize(12); doc.text('Sjekkliste', margin, y); y += 12;

    // Table
    doc.setFontSize(11); doc.setDrawColor(180); doc.setLineWidth(0.8);
    const tableX = margin, tableW = pageW - margin*2;
    const colW = [ tableW*0.58, tableW*0.12, tableW*0.30 ];
    const headerH = 24;
    // header
    drawCellRect(doc, tableX, y, colW[0], headerH, { fill: true, stroke: true });
    drawCellRect(doc, tableX + colW[0], y, colW[1], headerH, { fill: true, stroke: true });
    drawCellRect(doc, tableX + colW[0] + colW[1], y, colW[2], headerH, { fill: true, stroke: true });
    doc.setTextColor(255); doc.setFont(undefined, 'bold');
    doc.text('Punkt', tableX + 6, y + 16); doc.text('Status', tableX + colW[0] + 6, y + 16); doc.text('Notat', tableX + colW[0] + colW[1] + 6, y + 16);
    doc.setFont(undefined, 'normal'); doc.setTextColor(0); y += headerH;

    const rows = itemsForCheck(check.id).map(i => ({ punkt: i.label, status: i.status || '', notat: i.notes || '' }));
    rows.forEach(row => {
      const lh = 16; const pLines = wrapLines(doc, row.punkt, colW[0]-6); const nLines = wrapLines(doc, row.notat, colW[2]-6);
      const lineCount = Math.max(pLines.length, Math.max(1, nLines.length)); let rowH = Math.max(24, 12 + lineCount * lh);
      if (y + rowH + 80 > pageH) { drawFooterAndWatermark(doc, pageW, pageH, margin); doc.addPage(); y = margin;
        drawCellRect(doc, tableX, y, colW[0], headerH, { fill: true, stroke: true });
        drawCellRect(doc, tableX + colW[0], y, colW[1], headerH, { fill: true, stroke: true });
        drawCellRect(doc, tableX + colW[0] + colW[1], y, colW[2], headerH, { fill: true, stroke: true });
        doc.setTextColor(255); doc.setFont(undefined, 'bold');
        doc.text('Punkt', tableX + 6, y + 16); doc.text('Status', tableX + colW[0] + 6, y + 16); doc.text('Notat', tableX + colW[0] + colW[1] + 6, y + 16);
        doc.setFont(undefined, 'normal'); doc.setTextColor(0); y += headerH; }
      const isAvvik = String(row.status).toLowerCase() === 'avvik';
      if (isAvvik) { doc.setFillColor(255, 235, 238); }
      drawCellRect(doc, tableX, y, colW[0], rowH, { fill: isAvvik, stroke: true });
      drawCellRect(doc, tableX + colW[0], y, colW[1], rowH, { fill: isAvvik, stroke: true });
      drawCellRect(doc, tableX + colW[0] + colW[1], y, colW[2], rowH, { fill: isAvvik, stroke: true });
      if (isAvvik) doc.setFillColor(255,255,255);
      doc.setTextColor(isAvvik ? 160 : 0);
      textInCell(doc, row.punkt, tableX, y, colW[0], rowH, lh);
      doc.text(row.status || '', tableX + colW[0] + 6, y + 16);
      textInCell(doc, row.notat, tableX + colW[0] + colW[1], y, colW[2], rowH, lh);
      doc.setTextColor(0);
      y += rowH;
    });

    drawFooterAndWatermark(doc, pageW, pageH, margin);
    const fname = makeReportFilename({
      date: (check.date || '').replace(/-/g, ''),
      customerName: cust?.name,
      individualName: indiv?.name,
      type: indiv?.type,
      serial: indiv?.serial,
      id: check.id
    });
    doc.save(fname);
  };

  function sendEmail(check) {
    const c = currentCustomer || store.customers.find(c => c.id === (currentIndividual?.customerId));
    const to = c?.email || '';
    const subject = encodeURIComponent(`Årskontroll – ${check.date} – ${c?.name||'Kunde'}`);
    const body = encodeURIComponent(`Hei ${c?.contact||''},\n\nVedlagt finner du rapport for årskontroll.\n\nMvh\nPetersson Industri og Service\nTlf: +47 911 28 084`);
    window.location.href = `mailto:${encodeURIComponent(to)}?subject=${subject}&body=${body}`;
  }

  function exportDailyBundle(customer, isoDate) {
    const checks = collectChecksForCustomerDate(store, customer.id, isoDate);
    if (!checks.length) { alert('Ingen rapporter funnet for valgt dato.'); return; }
    const doc = new jsPDF({ unit:'pt', format:'a4' });
    const margin = 40, lineH = 18;
    const pageW = doc.internal.pageSize.getWidth(), pageH = doc.internal.pageSize.getHeight();
    const colW = [ (pageW - margin*2) * 0.58, (pageW - margin*2) * 0.12, (pageW - margin*2) * 0.30 ];
    const headerH = 24;
    checks.forEach((check, idx) => {
      if (idx>0) doc.addPage();
      let y = margin;
      const indiv = store.individuals.find(i => i.id === check.individualId);
      const typeTitle = cleanProductName(indiv?.type || 'Produkt');
      doc.setFontSize(16); doc.text(`${typeTitle} – årskontroll`, margin, y); y += 26;
      doc.setFontSize(11);
      const field = (label,val)=>{ doc.text(`${label}: ${val||''}`, margin, y); y += lineH; };
      field('Kunde', customer.name || ''); field('Individ', indiv ? `${indiv.name}${indiv?.serial?' – '+indiv.serial:''}` : '');
      field('Dato', check.date); field('Kontrollør', check.inspector); field('Resultat', check.result);
      if (check.notes){ doc.text('Notater:', margin, y); y += lineH; for (const ln of wrapLines(doc, check.notes, pageW - margin*2)) { doc.text(ln, margin, y); y += lineH; } }
      if (check.nextDate){ y += 6; field('Neste kontroll', check.nextDate); }
      y += 8; doc.setFontSize(12); doc.text('Sjekkliste', margin, y); y += 12;
      doc.setFontSize(11); doc.setDrawColor(180); doc.setLineWidth(0.8);
      const tableX = margin;
      drawCellRect(doc, tableX, y, colW[0], headerH, { fill: true, stroke: true });
      drawCellRect(doc, tableX + colW[0], y, colW[1], headerH, { fill: true, stroke: true });
      drawCellRect(doc, tableX + colW[0] + colW[1], y, colW[2], headerH, { fill: true, stroke: true });
      doc.setTextColor(255); doc.setFont(undefined, 'bold');
      doc.text('Punkt', tableX + 6, y + 16); doc.text('Status', tableX + colW[0] + 6, y + 16); doc.text('Notat', tableX + colW[0] + colW[1] + 6, y + 16);
      doc.setFont(undefined, 'normal'); doc.setTextColor(0); y += headerH;
      const rows = store.items.filter(i => i.yearcheckId === check.id).map(i => ({ punkt: i.label, status: i.status || '', notat: i.notes || '' }));
      rows.forEach(row => {
        const lh = 16; const pLines = wrapLines(doc, row.punkt, colW[0]-6); const nLines = wrapLines(doc, row.notat, colW[2]-6);
        const lineCount = Math.max(pLines.length, Math.max(1, nLines.length)); let rowH = Math.max(24, 12 + lineCount * lh);
        if (y + rowH + 80 > pageH) { drawFooterAndWatermark(doc, pageW, pageH, margin); doc.addPage(); y = margin;
          drawCellRect(doc, tableX, y, colW[0], headerH, { fill: true, stroke: true });
          drawCellRect(doc, tableX + colW[0], y, colW[1], headerH, { fill: true, stroke: true });
          drawCellRect(doc, tableX + colW[0] + colW[1], y, colW[2], headerH, { fill: true, stroke: true });
          doc.setTextColor(255); doc.setFont(undefined, 'bold');
          doc.text('Punkt', tableX + 6, y + 16); doc.text('Status', tableX + colW[0] + 6, y + 16); doc.text('Notat', tableX + colW[0] + colW[1] + 6, y + 16);
          doc.setFont(undefined, 'normal'); doc.setTextColor(0); y += headerH; }
        const isAvvik = String(row.status).toLowerCase() === 'avvik';
        if (isAvvik) { doc.setFillColor(255, 235, 238); }
        drawCellRect(doc, tableX, y, colW[0], rowH, { fill: isAvvik, stroke: true });
        drawCellRect(doc, tableX + colW[0], y, colW[1], rowH, { fill: isAvvik, stroke: true });
        drawCellRect(doc, tableX + colW[0] + colW[1], y, colW[2], rowH, { fill: isAvvik, stroke: true });
        if (isAvvik) doc.setFillColor(255,255,255);
        doc.setTextColor(isAvvik ? 160 : 0);
        textInCell(doc, row.punkt, tableX, y, colW[0], rowH, lh);
        doc.text(row.status || '', tableX + colW[0] + 6, y + 16);
        textInCell(doc, row.notat, tableX + colW[0] + colW[1], y, colW[2], rowH, lh);
        doc.setTextColor(0);
        y += rowH;
      });
      drawFooterAndWatermark(doc, pageW, pageH, margin);
    });
    const fname = `aarskontroll_bundle_${slugify(customer.name)}_${(bundleDate||'').replace(/-/g,'')}.pdf`.slice(0,120);
    doc.save(fname);
  }

  async function emailDailyBundleWithEmailJS(customer, isoDate) {
    if (!(window.emailjs && EMAILJS_PUBLIC_KEY && EMAILJS_SERVICE_ID && EMAILJS_TEMPLATE_ID)) {
      alert('EmailJS er ikke konfigurert (mangler nøkler). Åpne index.html og fyll inn nøklene.');
      return;
    }
    const checks = collectChecksForCustomerDate(store, customer.id, isoDate);
    if (!checks.length) { alert('Ingen rapporter funnet for valgt dato.'); return; }
    const doc = new jsPDF({ unit:'pt', format:'a4' });
    const margin = 40, lineH = 18;
    const pageW = doc.internal.pageSize.getWidth(), pageH = doc.internal.pageSize.getHeight();
    const colW = [ (pageW - margin*2) * 0.58, (pageW - margin*2) * 0.12, (pageW - margin*2) * 0.30 ];
    const headerH = 24;
    checks.forEach((check, idx) => {
      if (idx>0) doc.addPage();
      let y = margin;
      const indiv = store.individuals.find(i => i.id === check.individualId);
      const typeTitle = cleanProductName(indiv?.type || 'Produkt');
      doc.setFontSize(16); doc.text(`${typeTitle} – årskontroll`, margin, y); y += 26;
      doc.setFontSize(11);
      const field = (label,val)=>{ doc.text(`${label}: ${val||''}`, margin, y); y += lineH; };
      field('Kunde', customer.name || ''); field('Individ', indiv ? `${indiv.name}${indiv?.serial?' – '+indiv.serial:''}` : '');
      field('Dato', check.date); field('Kontrollør', check.inspector); field('Resultat', check.result);
      if (check.notes){ doc.text('Notater:', margin, y); y += lineH; for (const ln of wrapLines(doc, check.notes, pageW - margin*2)) { doc.text(ln, margin, y); y += lineH; } }
      if (check.nextDate){ y += 6; field('Neste kontroll', check.nextDate); }
      y += 8; doc.setFontSize(12); doc.text('Sjekkliste', margin, y); y += 12;
      doc.setFontSize(11); doc.setDrawColor(180); doc.setLineWidth(0.8);
      const tableX = margin;
      drawCellRect(doc, tableX, y, colW[0], headerH, { fill: true, stroke: true });
      drawCellRect(doc, tableX + colW[0], y, colW[1], headerH, { fill: true, stroke: true });
      drawCellRect(doc, tableX + colW[0] + colW[1], y, colW[2], headerH, { fill: true, stroke: true });
      doc.setTextColor(255); doc.setFont(undefined, 'bold');
      doc.text('Punkt', tableX + 6, y + 16); doc.text('Status', tableX + colW[0] + 6, y + 16); doc.text('Notat', tableX + colW[0] + colW[1] + 6, y + 16);
      doc.setFont(undefined, 'normal'); doc.setTextColor(0); y += headerH;
      const rows = store.items.filter(i => i.yearcheckId === check.id).map(i => ({ punkt: i.label, status: i.status || '', notat: i.notes || '' }));
      rows.forEach(row => {
        const lh = 16; const pLines = wrapLines(doc, row.punkt, colW[0]-6); const nLines = wrapLines(doc, row.notat, colW[2]-6);
        const lineCount = Math.max(pLines.length, Math.max(1, nLines.length)); let rowH = Math.max(24, 12 + lineCount * lh);
        if (y + rowH + 80 > pageH) { drawFooterAndWatermark(doc, pageW, pageH, margin); doc.addPage(); y = margin;
          drawCellRect(doc, tableX, y, colW[0], headerH, { fill: true, stroke: true });
          drawCellRect(doc, tableX + colW[0], y, colW[1], headerH, { fill: true, stroke: true });
          drawCellRect(doc, tableX + colW[0] + colW[1], y, colW[2], headerH, { fill: true, stroke: true });
          doc.setTextColor(255); doc.setFont(undefined, 'bold');
          doc.text('Punkt', tableX + 6, y + 16); doc.text('Status', tableX + colW[0] + 6, y + 16); doc.text('Notat', tableX + colW[0] + colW[1] + 6, y + 16);
          doc.setFont(undefined, 'normal'); doc.setTextColor(0); y += headerH; }
        const isAvvik = String(row.status).toLowerCase() === 'avvik';
        if (isAvvik) { doc.setFillColor(255, 235, 238); }
        drawCellRect(doc, tableX, y, colW[0], rowH, { fill: isAvvik, stroke: true });
        drawCellRect(doc, tableX + colW[0], y, colW[1], rowH, { fill: isAvvik, stroke: true });
        drawCellRect(doc, tableX + colW[0] + colW[1], y, colW[2], rowH, { fill: isAvvik, stroke: true });
        if (isAvvik) doc.setFillColor(255,255,255);
        doc.setTextColor(isAvvik ? 160 : 0);
        textInCell(doc, row.punkt, tableX, y, colW[0], rowH, lh);
        doc.text(row.status || '', tableX + colW[0] + 6, y + 16);
        textInCell(doc, row.notat, tableX + colW[0] + colW[1], y, colW[2], rowH, lh);
        doc.setTextColor(0);
        y += rowH;
      });
      drawFooterAndWatermark(doc, pageW, pageH, margin);
    });
    const fname = `aarskontroll_bundle_${slugify(customer.name)}_${(isoDate||'').replace(/-/g,'')}.pdf`.slice(0,120);
    const blob = doc.output('blob');
    const dataUrl = await new Promise((resolve, reject) => { const r = new FileReader(); r.onloadend = () => resolve(r.result); r.onerror = reject; r.readAsDataURL(blob); });
    const base64 = String(dataUrl).split(',')[1];

    try {
      await emailjs.send(
        EMAILJS_SERVICE_ID,
        EMAILJS_TEMPLATE_ID,
        {
          to_email: customer.email || '',
          to_name: customer.contact || customer.name || 'Kunde',
          subject: `Årskontroller – ${customer.name} – ${isoDate}`,
          message: `Hei ${customer.contact||customer.name||'Kunde'},\n\nVedlagt finner du samlet PDF for alle årskontroller ${isoDate}.\n\nMvh\nPetersson Industri og Service`,
          attachment: base64,
          attachment_filename: fname
        },
        EMAILJS_PUBLIC_KEY
      );
      alert('E-post sendt via EmailJS!');
    } catch (err) {
      console.error(err);
      alert('Klarte ikke å sende e-post via EmailJS. Sjekk nøkler/mal.');
    }
  }

  return (
    <StoreCtx.Provider value={{store, setStore}}>
      <div>
        {view==='customers' && (
          <CustomersPage
            store={store}
            onPickCustomer={(c)=>{ setCurrentCustomer(c); setView('customerDetail'); }}
          />
        )}

        {view==='customerDetail' && currentCustomer && (
          <CustomerDetailPage
            store={store}
            customer={currentCustomer}
            bundleDate={bundleDate}
            onChangeBundleDate={setBundleDate}
            onBack={()=>setView('customers')}
            onNewCheck={(ind)=>{ setCurrentIndividual(ind); setCheckItems([]); setCheckForm({date:TODAY(), inspector:'', result:'OK', notes:''}); setView('newCheck'); }}
            onOpenReports={(ind)=>{ setCurrentIndividual(ind); setView('reports'); }}
            onBundle={exportDailyBundle}
            onBundleEmail={(customer, d)=>{
              const to = customer.email || '';
              const subject = encodeURIComponent(`Årskontroller – ${customer.name} – ${d}`);
              const body = encodeURIComponent(`Hei ${customer.contact||''},\n\nJeg har generert én samlet PDF med alle årskontroll-rapporter for ${d}.\nLegg ved filen du nettopp lastet ned i e-posten.\n\nMvh\nPetersson Industri og Service\nTlf: +47 911 28 084`);
              window.location.href = `mailto:${encodeURIComponent(to)}?subject=${subject}&body=${body}`;
            }}
            onEmailJS={emailDailyBundleWithEmailJS}
          />
        )}

        {view==='reports' && currentIndividual && (
          <ReportsPage
            store={store}
            individual={currentIndividual}
            onBack={()=>setView('customerDetail')}
            exportPdf={exportPdf}
            sendEmail={sendEmail}
          />
        )}

        {view==='newCheck' && (
          <div className="row mt12">
            <Card title={`Nytt individ for kunde: ${currentCustomer?.name || ''}`} actions={<Button onClick={()=>setView('customerDetail')}>Tilbake</Button>}>
              <div className="mt8">
                <div className="label">Navn / betegnelse</div>
                <Input value={indForm.name} onChange={e=>setIndForm({...indForm, name:e.target.value})} />
              </div>
              <div className="row">
                <div>
                  <div className="label">Type produkt (standard)</div>
                  <select className="input" value={indForm.type} onChange={e=>setIndForm({...indForm, type:e.target.value})}>
                    <option value="">Velg produkt...</option>
                    <option value="EN361 / EN358 / EN813 – Sele">EN361 / EN358 / EN813 – Sele</option>
                    <option value="EN355 – Fangline / Falldemper">EN355 – Fangline / Falldemper</option>
                    <option value="EN360 – Fallblokk">EN360 – Fallblokk</option>
                    <option value="EN353-2 – Linesystem / Vertikal line">EN353-2 – Linesystem / Vertikal line</option>
                    <option value="EN358 – Støttesystem">EN358 – Støttesystem</option>
                    <option value="EN354 – Forbindelsesline">EN354 – Forbindelsesline</option>
                    <option value="EN795 – Forankringsanordning">EN795 – Forankringsanordning</option>
                    <option value="EN362 – Koblingsstykke / Karabiner">EN362 – Koblingsstykke / Karabiner</option>
                    <option value="EN341 – Nedfirings- / Redningsutstyr">EN341 – Nedfirings- / Redningsutstyr</option>
                  </select>
                </div>
                <div>
                  <div className="label">Serienummer</div>
                  <Input value={indForm.serial} onChange={e=>setIndForm({...indForm, serial:e.target.value})} />
                </div>
              </div>
              <div className="mt8">
                <div className="label">Notater</div>
                <textarea className="input" rows="3" value={indForm.notes} onChange={e=>setIndForm({...indForm, notes:e.target.value})}></textarea>
              </div>
              <div className="mt12" style={{display:'flex', gap:8}}>
                <Button onClick={addIndividual}>Lagre individ</Button>
                <Button onClick={()=>{ setCurrentIndividual({ ...indForm, id:'tmp', customerId: currentCustomer?.id }); setView('customerDetail'); }}>Avbryt</Button>
              </div>
            </Card>

            <NewCheckPage
              individual={currentIndividual}
              checkForm={checkForm}
              setCheckForm={setCheckForm}
              checkItems={checkItems}
              setCheckItems={setCheckItems}
              startChecklist={startChecklist}
              saveYearcheck={()=>{ saveYearcheck(); setView('customerDetail'); }}
              onBack={()=>setView('customerDetail')}
            />
          </div>
        )}
      </div>
    </StoreCtx.Provider>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App/>);
