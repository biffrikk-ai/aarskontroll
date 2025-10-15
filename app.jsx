const { useState, useEffect, useMemo } = React;
const { jsPDF } = window.jspdf;

// Firmafooter og watermark
const FOOTER_LINES = [
  'Petersson Industri og Service',
  'Smed Qvales vei 19b, 8012 Bodø',
  'Tlf: +47 911 28 084   –   E-post: bjorn.petersson@outlook.com',
  'Org.nr: 933 939 871 MVA'
];
const WATERMARK = '© 2025 Petersson Industri og Service – Smed Qvales vei 19b, 8012 Bodø – Org.nr: 933 939 871 MVA';

// Utils & Store
const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36);
const TODAY = () => new Date().toISOString().slice(0,10);
const LS_KEY = "aarskontroll_webstore_v1";

const defaultStore = { customers: [], individuals: [], yearchecks: [], items: [] };
const loadStore = () => { try { return JSON.parse(localStorage.getItem(LS_KEY) || "{}"); } catch { return {}; } };
const saveStore = (data) => localStorage.setItem(LS_KEY, JSON.stringify(data));

// Checklists
const CHECKLISTS = {
  fallsikringssele: [
    { key: 'merking', label: 'Merking/ID/CE synlig og lesbar' },
    { key: 'webbing', label: 'Stropper/webbing uten kutt/slitasje/frynser/kjemikalieskader' },
    { key: 'søm', label: 'Sømmer hele – ingen utrasing/løse tråder' },
    { key: 'spenner', label: 'Spenner/justering fungerer – ikke deformert/korrodert' },
    { key: 'd_ringer', label: 'D-ringer/forankring uten sprekker/deformasjon' },
    { key: 'justering', label: 'Passform/justering mulig – ingen glid' },
    { key: 'etikett', label: 'Bruker-/inspeksjonsetikett til stede' },
    { key: 'rens', label: 'Rent/tørt – lagring riktig' },
    { key: 'historikk', label: 'Tidligere avvik lukket' }
  ],
  fallblokk: [
    { key: 'hus', label: 'Hus uten sprekker/skader – tett' },
    { key: 'line', label: 'Line (bånd/vaier) uten knekk/fliser/kutt/korrosjon' },
    { key: 'hak', label: 'Kroker/karabinere – låsespærre fungerer' },
    { key: 'bremse', label: 'Bremsemekanisme OK (trekk-test) – jevn' },
    { key: 'innspoling', label: 'Innspoling/retur jevn – ikke rykkete' },
    { key: 'merker', label: 'Merkelapp/seriell/år synlig' },
    { key: 'forankring', label: 'Forankringspunkt kompatibelt/helt' },
    { key: 'fallindikator', label: 'Fallindikator ikke utløst' },
    { key: 'korrosjon', label: 'Ingen korrosjon på metall' }
  ],
  falline: [
    { key: 'tau_baand', label: 'Tau/bånd uten slitasje/kutt/UV/kjemisk skade' },
    { key: 'energiabsorber', label: 'Energiabsorber uåpnet/intakt' },
    { key: 'søm_knute', label: 'Sømmer/knuter hele' },
    { key: 'koblinger', label: 'Kroker/karabinere låser og fungerer' },
    { key: 'lengde', label: 'Lengde/merkning iht. spesifikasjon' },
    { key: 'merkelapp', label: 'CE/standard/seriell lesbar' },
    { key: 'fallindikator', label: 'Fallindikator ikke utløst' },
    { key: 'renhold', label: 'Rent/tørt – lagring riktig' }
  ],
};
const toChecklistKey = (type="") => {
  const t = String(type).toLowerCase();
  if (t.includes('sele')) return 'fallsikringssele';
  if (t.includes('blokk') || t.includes('srl')) return 'fallblokk';
  if (t.includes('line') || t.includes('lanyard') || t.includes('fangline') || t.includes('falldemper')) return 'falline';
  return null;
};

const Input = (props) => <input {...props} className={"input " + (props.className||"")} />;
const Button = ({children, ...p}) => <button {...p} className={"btn " + (p.className||"")}>{children}</button>;
const Card = ({title, children, actions}) => (
  <div className="card">
    {title && <div style={{fontWeight:700, fontSize:16, marginBottom:8}}>{title}</div>}
    {children}
    {actions && <div className="mt12" style={{display:'flex', gap:8}}>{actions}</div>}
  </div>
);

function App(){
  const [store, setStore] = useState(() => ({...defaultStore, ...loadStore()}));
  useEffect(() => { saveStore(store); }, [store]);

  const [tab, setTab] = useState('customers');
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [selectedIndividual, setSelectedIndividual] = useState(null);

  const [custForm, setCustForm] = useState({name:'', address:'', contact:'', phone:'', email:'', orgnr:''});
  const [indForm, setIndForm] = useState({name:'', type:'', serial:'', notes:''});
  const [checkForm, setCheckForm] = useState({date:TODAY(), inspector:'', result:'OK', notes:''});
  const [checkItems, setCheckItems] = useState([]);

  const individuals = useMemo(() => store.individuals.filter(i => i.customerId === selectedCustomer?.id), [store.individuals, selectedCustomer]);
  const checks = useMemo(() => store.yearchecks.filter(c => c.individualId === selectedIndividual?.id).sort((a,b)=>b.date.localeCompare(a.date)), [store.yearchecks, selectedIndividual]);

  const addCustomer = () => {
    if (!custForm.name.trim()) return alert('Kundenavn må fylles ut');
    const c = { id: uid(), ...custForm };
    setStore(s => ({...s, customers: [...s.customers, c]}));
    setCustForm({name:'', address:'', contact:'', phone:'', email:'', orgnr:''});
  };

  const addIndividual = () => {
    if (!selectedCustomer) return alert('Velg kunde først');
    if (!indForm.name.trim()) return alert('Navn må fylles ut');
    const ind = { id: uid(), customerId: selectedCustomer.id, ...indForm };
    setStore(s => ({...s, individuals: [...s.individuals, ind]}));
    setIndForm({name:'', type:'', serial:'', notes:''});
  };

  const startChecklist = () => {
    if (!selectedIndividual) return alert('Velg individ');
    const key = toChecklistKey(selectedIndividual.type);
    const base = key && CHECKLISTS[key] ? CHECKLISTS[key] : [];
    setCheckItems(base.map(i => ({...i, status:'OK', notes:''})));
    setCheckForm({date:TODAY(), inspector:'', result:'OK', notes:''});
  };

  const saveYearcheck = () => {
    if (!selectedIndividual) return alert('Velg individ');
    const y = { id: uid(), individualId: selectedIndividual.id, ...checkForm, nextDate: addOneYear(checkForm.date) };
    const items = (checkItems||[]).map(ci => ({ id: uid(), yearcheckId: y.id, itemKey: ci.key, label: ci.label, status: ci.status, notes: ci.notes }));
    setStore(s => ({...s, yearchecks:[y, ...s.yearchecks], items:[...s.items, ...items]}));
  };

  const addOneYear = (iso) => { try { const d = new Date(iso); d.setFullYear(d.getFullYear()+1); return d.toISOString().slice(0,10); } catch { return iso; } };
  const itemsForCheck = (id) => store.items.filter(i => i.yearcheckId === id);

  const exportPdf = (check) => {
    const doc = new jsPDF({ unit:'pt', format:'a4' });
    const margin = 40, lineH = 18, pageW = doc.internal.pageSize.getWidth();
    let y = margin;
    doc.setFontSize(16); doc.text('Årskontroll – rapport (v1.0)', margin, y); y += 24;
    doc.setFontSize(11);
    const field = (label,val)=>{ doc.text(`${label}: ${val||''}`, margin, y); y += lineH; };
    field('Dato', check.date); field('Kontrollør', check.inspector); field('Resultat', check.result);
    if (check.notes){ doc.text('Notater:', margin, y); y += lineH; y = paragraph(doc, check.notes, margin, y, pageW - margin*2, lineH); }
    if (check.nextDate){ y += 6; field('Neste kontroll', check.nextDate); }
    y += 10; doc.text('Sjekkliste', margin, y); y += lineH;
    const rows = itemsForCheck(check.id).map(i => [i.label, i.status||'', i.notes||'']);
    y = table(doc, ['Punkt','Status','Notat'], rows, margin, y, pageW - margin*2, lineH);

    // Footer
    const pageH = doc.internal.pageSize.getHeight();
    const footerY = pageH - 50;
    doc.setLineWidth(0.5); doc.setDrawColor(200); doc.line(margin, footerY, pageW - margin, footerY);
    doc.setFontSize(11);
    let fy = footerY + 14;
    FOOTER_LINES.forEach(line => { doc.text(line, margin, fy); fy += 14; });

    // Watermark (centered, gray)
    doc.setFontSize(10);
    doc.setTextColor(130);
    const wmWidth = doc.getTextWidth(WATERMARK);
    doc.text(WATERMARK, (pageW - wmWidth)/2, pageH - 10);
    doc.setTextColor(0);

    doc.save(`aarskontroll_${check.date}.pdf`);
  };

  const paragraph = (doc, text, x, y, w, lh) => {
    const words = String(text).split(/\s+/); let line = '', maxY = y;
    for (let n=0;n<words.length;n++){
      const test = line + words[n] + ' ';
      if (doc.getTextWidth(test) > w){ doc.text(line, x, y); line = words[n] + ' '; y += lh; maxY = y; }
      else line = test;
    }
    if (line){ doc.text(line, x, y); maxY = y+lh; }
    return maxY;
  };
  const table = (doc, headers, rows, x, y, w, lh) => {
    const colW = [w*0.5, w*0.15, w*0.35];
    doc.setFont(undefined, 'bold');
    headers.forEach((h,i)=> doc.text(String(h), x + colW.slice(0,i).reduce((a,b)=>a+b,0), y));
    doc.setFont(undefined, 'normal'); y += lh;
    rows.forEach(r => { r.forEach((cell,i)=>{ const text = String(cell||''); doc.text(text.length>70? text.slice(0,67)+'…' : text, x + colW.slice(0,i).reduce((a,b)=>a+b,0), y); }); y += lh; });
    return y;
  };

  const sendEmail = (check) => {
    const cust = selectedCustomer || store.customers.find(c => c.id === (selectedIndividual?.customerId));
    const to = cust?.email || '';
    const subject = encodeURIComponent(`Årskontroll – ${check.date} – ${cust?.name||'Kunde'}`);
    const body = encodeURIComponent(
      `Hei ${cust?.contact||''},\\n\\nVedlagt finner du rapport for årskontroll.\\n\\n` +
      `Mvh\\nPetersson Industri og Service\\nTlf: +47 911 28 084`
    );
    window.location.href = `mailto:${encodeURIComponent(to)}?subject=${subject}&body=${body}`;
  };

  return (
    <div>
      <div className="mt12" style={{display:'flex', gap:8}}>
        {['customers','individuals','checks'].map(t => (
          <button key={t} className={"badge " + (t===tab?'active':'')} onClick={()=>setTab(t)}>
            {t==='customers'?'Kunder':t==='individuals'?'Individer':'Årskontroller'}
          </button>
        ))}
      </div>

      {tab==='customers' && (
        <div className="row mt12">
          <Card title="Ny kunde" actions={<Button onClick={addCustomer}>Lagre kunde</Button>}>
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
          </Card>

          <Card title="Kundeliste">
            {store.customers.length===0 && <div className="small">Ingen kunder enda.</div>}
            {store.customers.map(c => (
              <div key={c.id} className="card mt8" style={{padding:10,cursor:'pointer'}}
                   onClick={()=>{setSelectedCustomer(c); setTab('individuals')}}>
                <div style={{fontWeight:600}}>{c.name}</div>
                <div className="small">Org.nr: {c.orgnr || '-'}</div>
                <div className="small">{c.contact} {c.phone}</div>
              </div>
            ))}
          </Card>
        </div>
      )}

      {tab==='individuals' && (
        <div className="row mt12">
          <Card title={`Nytt individ ${selectedCustomer?`(kunde: ${selectedCustomer.name})`:''}`} actions={<Button onClick={addIndividual}>Lagre individ</Button>}>
            {!selectedCustomer && <div className="small" style={{color:'#b91c1c'}}>Velg en kunde i fanen «Kunder» først.</div>}
            <div className="mt8">
              <div className="label">Navn / betegnelse</div>
              <Input value={indForm.name} onChange={e=>setIndForm({...indForm, name:e.target.value})} />
            </div>
            <div className="row">
              <div>
                <div className="label">Type (sele/blokk/line)</div>
                <Input value={indForm.type} onChange={e=>setIndForm({...indForm, type:e.target.value})} />
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
          </Card>

          <Card title={`Individer ${selectedCustomer?`– ${selectedCustomer.name}`:''}`}>
            {(!selectedCustomer) && <div className="small">Ingen kunde valgt.</div>}
            {selectedCustomer && store.individuals.filter(i=>i.customerId===selectedCustomer.id).map(i => (
              <div key={i.id} className="card mt8" style={{padding:10,cursor:'pointer'}}
                   onClick={()=>{setSelectedIndividual(i); setTab('checks')}}>
                <div style={{fontWeight:600}}>{i.name}</div>
                <div className="small">{i.type} {i.serial?`- ${i.serial}`:''}</div>
              </div>
            ))}
          </Card>
        </div>
      )}

      {tab==='checks' && (
        <div className="row mt12">
          <Card title={`Ny årskontroll ${selectedIndividual?`(individ: ${selectedIndividual.name})`:''}`} actions={<><Button onClick={saveYearcheck}>Lagre kontroll</Button></>}>
            {!selectedIndividual && <div className="small" style={{color:'#b91c1c'}}>Velg et individ først.</div>}
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
                        <button key={opt} className={"badge "+(it.status===opt?'active':'')} onClick={()=>setCheckItems(prev=>prev.map((p,i)=>i===idx?{...p, status:opt}:p))}>{opt}</button>
                      ))}
                    </div>
                    <input className="input mt8" placeholder="Notat (valgfritt)" value={it.notes} onChange={e=>setCheckItems(prev=>prev.map((p,i)=>i===idx?{...p, notes:e.target.value}:p))} />
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card title={`Kontroller ${selectedIndividual?`– ${selectedIndividual.name}`:''}`}>
            {(!selectedIndividual) && <div className="small">Ingen individ valgt.</div>}
            {selectedIndividual && store.yearchecks.filter(c=>c.individualId===selectedIndividual.id).sort((a,b)=>b.date.localeCompare(a.date)).map(ch => (
              <div key={ch.id} className="card mt8" style={{padding:10}}>
                <div style={{fontWeight:600}}>{ch.date} – {ch.result}</div>
                <div className="small">{ch.inspector}</div>
                <div className="mt8" style={{display:'flex', gap:8}}>
                  <Button onClick={()=>exportPdf(ch)}>Eksporter PDF</Button>
                  <Button onClick={()=>{ exportPdf(ch); sendEmail(ch); }}>Send e-post</Button>
                </div>
                <details className="mt8">
                  <summary className="small" style={{cursor:'pointer'}}>Vis sjekkliste</summary>
                  <table className="table mt8">
                    <thead><tr><th>Punkt</th><th>Status</th><th>Notat</th></tr></thead>
                    <tbody>
                      {store.items.filter(i=>i.yearcheckId===ch.id).map(i => (
                        <tr key={i.id}>
                          <td>{i.label}</td><td>{i.status}</td><td>{i.notes}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </details>
              </div>
            ))}
          </Card>
        </div>
      )}
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App/>);
