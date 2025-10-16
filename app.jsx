const { useState, useEffect } = React;
const { jsPDF } = window.jspdf;

const LS = "aarskontroll_store_v18";
const load = () => { try { return JSON.parse(localStorage.getItem(LS)||"{}"); } catch { return {}; } };
const save = (s) => localStorage.setItem(LS, JSON.stringify(s));
const uid = () => Math.random().toString(36).slice(2)+Date.now().toString(36);
const today = () => new Date().toISOString().slice(0,10);
const cleanType = (t='') => String(t).replace(/EN\s*\d+(\s*\/\s*EN\d+)*/gi,'').replace(/[–-]\s*/g,'').trim();
function readFileAsDataURL(file){ return new Promise((res,rej)=>{ const r=new FileReader(); r.onload=()=>res(r.result); r.onerror=rej; r.readAsDataURL(file); }); }

function App(){
  const [db, setDb] = useState(()=>({customers:[], individuals:[], checks:[], items:[], ...load()}));
  useEffect(()=>save(db),[db]);

  const [view, setView] = useState('customers');
  const [currentCustomer, setCurrentCustomer] = useState(null);
  const [currentIndividual, setCurrentIndividual] = useState(null);

  const [cust, setCust] = useState({name:'',contact:'',phone:'',email:'',orgnr:'',street:'',zip:'',city:''});
  const [ind, setInd] = useState({name:'',type:'',serial:'',notes:''});
  const [check, setCheck] = useState({date:today(),inspector:'',result:'OK',notes:''});
  const [items, setItems] = useState([]);
  const [photo, setPhoto] = useState(null);

  const address = (c)=> [c.street, [c.zip,c.city].filter(Boolean).join(' ')].filter(Boolean).join(', ');

  // Backup / Import
  const exportBackup = () => {
    const blob = new Blob([JSON.stringify(db,null,2)], {type:'application/json'});
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = `aarskontroll-backup_${new Date().toISOString().slice(0,10)}.json`; a.click(); URL.revokeObjectURL(a.href);
  };
  const importBackup = async (file) => {
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      if (!data || typeof data !== 'object') throw new Error('Ugyldig fil');
      setDb({customers:[], individuals:[], checks:[], items:[], ...data});
      alert('Backup importert!');
    } catch (e) { alert('Kunne ikke importere: ' + e.message); }
  };

  // CRUD Customers
  const addCustomer = () => {
    if (!cust.name.trim()) return alert('Kundenavn må fylles ut');
    const c = { id: uid(), ...cust };
    setDb(s=>({...s, customers:[...s.customers, c]}));
    setCust({name:'',contact:'',phone:'',email:'',orgnr:'',street:'',zip:'',city:''});
  };
  const updateCustomer = (c) => setDb(s=>({...s, customers: s.customers.map(x=>x.id===c.id?c:x)}));
  const deleteCustomer = (id) => {
    if (!confirm('Slette kunde og alt knyttet?')) return;
    setDb(s=>{
      const inds = s.individuals.filter(i=>i.customerId===id).map(i=>i.id);
      return {
        customers: s.customers.filter(c=>c.id!==id),
        individuals: s.individuals.filter(i=>i.customerId!==id),
        checks: s.checks.filter(y=>!inds.includes(y.individualId)),
        items: s.items.filter(it=>!s.checks.some(y=>inds.includes(y.individualId) && it.yearcheckId===y.id))
      };
    });
    setCurrentCustomer(null); setView('customers');
  };

  // CRUD Individuals
  const addIndividual = () => {
    if (!currentCustomer) return alert('Velg kunde');
    if (!ind.name.trim()) return alert('Navn må fylles ut');
    if (!ind.type) return alert('Velg type');
    const d = { id: uid(), customerId: currentCustomer.id, ...ind };
    setDb(s=>({...s, individuals:[...s.individuals, d]}));
    setInd({name:'',type:'',serial:'',notes:''});
  };
  const updateIndividual = (d) => setDb(s=>({...s, individuals: s.individuals.map(x=>x.id===d.id?d:x)}));
  const deleteIndividual = (id) => {
    if (!confirm('Slette individ og tilhørende rapporter?')) return;
    setDb(s=>{
      const checks = s.checks.filter(y=>y.individualId===id).map(y=>y.id);
      return {
        ...s,
        individuals: s.individuals.filter(i=>i.id!==id),
        checks: s.checks.filter(y=>y.individualId!==id),
        items: s.items.filter(it=>!checks.includes(it.yearcheckId))
      };
    });
    if (currentIndividual?.id===id){ setCurrentIndividual(null); setView('customerDetail'); }
  };

  // Checks
  const startChecklist = (individual)=>{
    setCurrentIndividual(individual);
    setItems([
      {key:'merking', label:'Merkelapp/ID lesbar', status:'OK', notes:''},
      {key:'skade',   label:'Ingen kutt, rifter, deformasjon', status:'OK', notes:''},
      {key:'kobling', label:'Kroker/karabiner lukker korrekt', status:'OK', notes:''},
    ]);
    setPhoto(null);
    setCheck({date:today(),inspector:'',result:'OK',notes:''});
    setView('newCheck');
  };
  const saveCheck = ()=>{
    const y = { id: uid(), individualId: currentIndividual.id, photo: photo || null, ...check, nextDate: new Date(new Date(check.date).setFullYear(new Date(check.date).getFullYear()+1)).toISOString().slice(0,10) };
    const its = items.map(i=>({id:uid(), yearcheckId:y.id, ...i}));
    setDb(s=>({...s, checks:[y,...s.checks], items:[...s.items, ...its]}));
    setView('customerDetail');
  };
  const deleteCheck = (id) => {
    if (!confirm('Slette denne rapporten?')) return;
    setDb(s=>({...s, checks:s.checks.filter(y=>y.id!==id), items:s.items.filter(i=>i.yearcheckId!==id)}));
  };

  // PDF
  const exportPdf = (y)=>{
    const doc = new jsPDF({unit:'pt',format:'a4'});
    const margin=40, pageW=doc.internal.pageSize.getWidth(), pageH=doc.internal.pageSize.getHeight();
    let yPos = margin;
    const indiv = db.individuals.find(i=>i.id===y.individualId)||{};
    const cust = db.customers.find(c=>c.id===indiv.customerId)||{};
    doc.setFontSize(16); doc.text(`${cleanType(indiv.type||'Produkt')} – årskontroll`, margin, yPos); yPos+=26;
    doc.setFontSize(11);
    const line=(k,v)=>{ doc.text(`${k}: ${v||''}`, margin, yPos); yPos+=16; };
    line('Kunde', cust.name||''); line('Individ', `${indiv.name||''}${indiv.serial?' – '+indiv.serial:''}`); line('Dato', y.date); line('Kontrollør', y.inspector); line('Resultat', y.result);
    if (y.notes) { doc.text('Notater:', margin, yPos); yPos+=16; doc.text(y.notes, margin, yPos); yPos+=18; }

    // Photo (optional)
    if (y.photo) {
      try {
        const imgW = 400; const imgH = 260;
        doc.text('Bilde:', margin, yPos); yPos+=10;
        // auto-detect format by header
        const fmt = y.photo.startsWith('data:image/png') ? 'PNG' : 'JPEG';
        doc.addImage(y.photo, fmt, margin, yPos, imgW, imgH, undefined, 'FAST');
        yPos += imgH + 10;
      } catch(e){ /* ignore image errors */ }
    }

    yPos+=6; doc.setFontSize(12); doc.text('Sjekkliste', margin, yPos); yPos+=12;
    const colW = [ (pageW-margin*2)*0.58, (pageW-margin*2)*0.12, (pageW-margin*2)*0.30 ];
    doc.setDrawColor(180); doc.setLineWidth(0.8);
    ;[['Punkt','Status','Notat']].forEach(h=>{
      doc.setFillColor(90,168,255); doc.setTextColor(255);
      doc.rect(margin,yPos,colW[0],24,'FD'); doc.rect(margin+colW[0],yPos,colW[1],24,'FD'); doc.rect(margin+colW[0]+colW[1],yPos,colW[2],24,'FD');
      doc.text(h[0], margin+6,yPos+16); doc.text(h[1], margin+colW[0]+6,yPos+16); doc.text(h[2], margin+colW[0]+colW[1]+6,yPos+16);
      doc.setTextColor(0); yPos+=24;
    });
    const rows = db.items.filter(i=>i.yearcheckId===y.id).map(r=>({punkt:r.label,status:r.status,notat:r.notes||''}));
    rows.forEach(r=>{
      const isAvvik = String(r.status).toLowerCase()==='avvik';
      if (isAvvik) doc.setFillColor(255,235,238);
      doc.rect(margin,yPos,colW[0],28,isAvvik?'FD':'S'); doc.rect(margin+colW[0],yPos,colW[1],28,isAvvik?'FD':'S'); doc.rect(margin+colW[0]+colW[1],yPos,colW[2],28,isAvvik?'FD':'S');
      if (isAvvik) doc.setFillColor(255,255,255);
      doc.text(r.punkt, margin+6, yPos+18); doc.text(r.status||'', margin+colW[0]+6, yPos+18); doc.text(r.notat||'', margin+colW[0]+colW[1]+6, yPos+18);
      yPos+=28;
    });
    const footerY = pageH-60; doc.setDrawColor(200); doc.line(margin,footerY,pageW-margin,footerY);
    const f = ['Petersson Industri og Service','Smed Qvales vei 19b, 8012 Bodø','Tlf: +47 911 28 084 – E‑post: bjorn.petersson@outlook.com','Org.nr: 933 939 871 MVA'];
    let fy = footerY+14; f.forEach(t=>{doc.text(t, margin, fy); fy+=14;});
    const blob = doc.output('blob');
    const filename = `aarskontroll_${(cust.name||'kunde').replace(/[^a-z0-9]+/gi,'-').toLowerCase()}_${(indiv.name||'individ').replace(/[^a-z0-9]+/gi,'-').toLowerCase()}_${y.date.replace(/-/g,'')}.pdf`;
    if (navigator.share && navigator.canShare && navigator.canShare({ files: [new File([blob], filename, {type: 'application/pdf'})] })) {
      const file = new File([blob], filename, {type:'application/pdf'});
      navigator.share({ title: filename, text: 'Årskontroll-rapport', files: [file] }).catch(()=>doc.save(filename));
    } else {
      doc.save(filename);
      const subject = encodeURIComponent(`Årskontroll – ${cust.name||''} – ${y.date}`);
      const body = encodeURIComponent('Hei,\\n\\nSe vedlagt rapport.\\n\\nMvh\\nPetersson Industri og Service');
      const to = encodeURIComponent(cust.email||'');
      window.location.href = `mailto:${to}?subject=${subject}&body=${body}`;
    }
  };

  // Views
  const Customers = () => (
    <div className="grid two">
      <div className="card">
        <h3>Kunder</h3>
        <div style={{display:'flex',gap:8,flexWrap:'wrap',marginBottom:8}}>
          <button className="btn secondary" onClick={exportBackup}>Eksporter backup (JSON)</button>
          <label className="btn secondary" style={{display:'inline-flex',alignItems:'center',gap:8,cursor:'pointer'}}>
            Importer backup <input type="file" accept="application/json" style={{display:'none'}} onChange={e=>e.target.files[0]&&importBackup(e.target.files[0])} />
          </label>
        </div>
        {db.customers.length===0 && <div className="small">Ingen kunder enda.</div>}
        <ul style={{listStyle:'none',padding:0,margin:0}}>
          {db.customers.map(c=>(
            <li key={c.id} className="kundeitem">
              <div onClick={()=>{setCurrentCustomer(c); setView('customerDetail');}} style={{cursor:'pointer'}}>
                <div style={{fontWeight:800}}>{c.name}</div>
                <div className="small">{address(c)}</div>
                <div className="small">Kontakt: {c.contact||'-'} · {c.phone||'-'}</div>
              </div>
              <div style={{display:'flex',gap:6}}>
                <button className="btn secondary" onClick={()=>{
                  const name=prompt('Kundenavn', c.name); if(name===null)return;
                  const contact=prompt('Kontaktperson', c.contact||''); if(contact===null)return;
                  const phone=prompt('Telefon', c.phone||''); if(phone===null)return;
                  const email=prompt('E‑post', c.email||''); if(email===null)return;
                  const orgnr=prompt('Org.nr', c.orgnr||''); if(orgnr===null)return;
                  const street=prompt('Gateadresse', c.street||''); if(street===null)return;
                  const zip=prompt('Postnr', c.zip||''); if(zip===null)return;
                  const city=prompt('Poststed', c.city||''); if(city===null)return;
                  updateCustomer({...c,name,contact,phone,email,orgnr,street,zip,city});
                }}>Rediger</button>
                <button className="btn danger" onClick={()=>deleteCustomer(c.id)}>Slett</button>
              </div>
            </li>
          ))}
        </ul>
      </div>
      <div className="card">
        <h3>Ny kunde</h3>
        <div className="row three">
          <div><div className="label">Kundenavn</div><input className="input" value={cust.name} onChange={e=>setCust({...cust,name:e.target.value})}/></div>
          <div><div className="label">Kontaktperson</div><input className="input" value={cust.contact} onChange={e=>setCust({...cust,contact:e.target.value})}/></div>
          <div><div className="label">Telefon</div><input className="input" value={cust.phone} onChange={e=>setCust({...cust,phone:e.target.value})}/></div>
        </div>
        <div className="row three">
          <div><div className="label">E‑post</div><input className="input" value={cust.email} onChange={e=>setCust({...cust,email:e.target.value})}/></div>
          <div><div className="label">Org.nr</div><input className="input" value={cust.orgnr} onChange={e=>setCust({...cust,orgnr:e.target.value})}/></div>
        </div>
        <div className="row three">
          <div><div className="label">Gateadresse</div><input className="input" value={cust.street} onChange={e=>setCust({...cust,street:e.target.value})}/></div>
          <div><div className="label">Postnr</div><input className="input" value={cust.zip} onChange={e=>setCust({...cust,zip:e.target.value})}/></div>
          <div><div className="label">Poststed</div><input className="input" value={cust.city} onChange={e=>setCust({...cust,city:e.target.value})}/></div>
        </div>
        <div style={{marginTop:10}}><button className="btn" onClick={addCustomer}>Lagre kunde</button></div>
      </div>
    </div>
  );

  const CustomerDetail = () => {
    const inds = db.individuals.filter(i=>i.customerId===currentCustomer.id);
    const checks = db.checks.filter(y=>inds.some(i=>i.id===y.individualId)).sort((a,b)=>b.date.localeCompare(a.date));
    return (
      <div className="grid two">
        <div className="card">
          <h3>Kunde</h3>
          <div style={{fontWeight:800,fontSize:18}}>{currentCustomer.name}</div>
          <div className="small">{address(currentCustomer)}</div>
          <div className="small">Kontakt: {currentCustomer.contact||'-'} · {currentCustomer.phone||'-'}</div>
          <div className="small">E‑post: {currentCustomer.email||'-'} · Org.nr: {currentCustomer.orgnr||'-'}</div>
          <div className="divider"></div>
          <button className="btn secondary" onClick={()=>setView('customers')}>Tilbake</button>
        </div>
        <div className="card">
          <h3>Legg til individ</h3>
          <div className="row two">
            <div><div className="label">Navn / betegnelse</div><input className="input" value={ind.name} onChange={e=>setInd({...ind,name:e.target.value})}/></div>
            <div><div className="label">Serienummer</div><input className="input" value={ind.serial} onChange={e=>setInd({...ind,serial:e.target.value})}/></div>
          </div>
          <div className="row two">
            <div>
              <div className="label">Type produkt</div>
              <select className="input" value={ind.type} onChange={e=>setInd({...ind,type:e.target.value})}>
                <option value="">Velg …</option>
                <option>EN361 / EN358 / EN813 – Sele</option>
                <option>EN355 – Fangline / Falldemper</option>
                <option>EN360 – Fallblokk</option>
                <option>EN353-2 – Linesystem / Vertikal line</option>
                <option>EN358 – Støttesystem</option>
                <option>EN354 – Forbindelsesline</option>
                <option>EN795 – Forankringsanordning</option>
                <option>EN362 – Koblingsstykke / Karabiner</option>
                <option>EN341 – Nedfirings- / Redningsutstyr</option>
              </select>
            </div>
            <div><div className="label">Notater</div><textarea className="input" rows="3" value={ind.notes} onChange={e=>setInd({...ind,notes:e.target.value})}></textarea></div>
          </div>
          <div style={{marginTop:10}}><button className="btn" onClick={addIndividual}>Lagre individ</button></div>
        </div>

        <div className="card" style={{gridColumn:'1 / -1'}}>
          <h3>Individer</h3>
          {inds.length===0 && <div className="small">Ingen individer registrert.</div>}
          <ul style={{listStyle:'none',padding:0,margin:0}}>
            {inds.map(i=>{
              const last = db.checks.filter(y=>y.individualId===i.id).sort((a,b)=>b.date.localeCompare(a.date))[0];
              return (
                <li key={i.id} className="kundeitem" style={{alignItems:'flex-start'}}>
                  <div>
                    <div style={{fontWeight:800}}>{i.name}</div>
                    <div className="small">{cleanType(i.type)} {i.serial?`· SN: ${i.serial}`:''}</div>
                    <div className="small">Sist kontroll: {last?`${last.date} – ${last.result}`:'–'}</div>
                  </div>
                  <div style={{display:'flex',gap:6}}>
                    <button className="btn secondary" onClick={()=>{ setCurrentIndividual(i); setView('reports'); }}>Se rapporter</button>
                    <button className="btn" onClick={()=>startChecklist(i)}>Ny årskontroll</button>
                    <button className="btn secondary" onClick={()=>{
                      const name=prompt('Navn', i.name); if(name===null)return;
                      const type=prompt('Type', i.type); if(type===null)return;
                      const serial=prompt('Serienummer', i.serial||''); if(serial===null)return;
                      const notes=prompt('Notater', i.notes||''); if(notes===null)return;
                      setDb(s=>({...s, individuals: s.individuals.map(x=>x.id===i.id?{...i,name,type,serial,notes}:x)}));
                    }}>Rediger</button>
                    <button className="btn danger" onClick={()=>deleteIndividual(i.id)}>Slett</button>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>

        {checks.length>0 and (
          <div className="card" style={{gridColumn:'1 / -1'}}>
            <h3>Siste rapporter</h3>
            {checks.slice(0,5).map(y=>(
              <div key={y.id} className="kundeitem">
                <div>
                  <div style={{fontWeight:700}}>{y.date} – {y.result}</div>
                  <div className="small">{db.individuals.find(i=>i.id===y.individualId)?.name||''}</div>
                  {y.photo && <img src={y.photo} className="thumb" alt="Vedlagt bilde"/>}
                </div>
                <div style={{display:'flex',gap:6}}>
                  <button className="btn secondary" onClick={()=>{
                    const inspector=prompt('Kontrollør', y.inspector||''); if(inspector===null)return;
                    const result=prompt('Resultat (OK/Avvik)', y.result||'OK'); if(result===null)return;
                    const notes=prompt('Notater', y.notes||''); if(notes===null)return;
                    setDb(s=>({...s, checks: s.checks.map(c=>c.id===y.id?{...c,inspector:inspector,result:result,notes:notes}:c)}));
                  }}>Rediger</button>
                  <button className="btn secondary" onClick={()=>exportPdf(y)}>PDF</button>
                  <button className="btn danger" onClick={()=>deleteCheck(y.id)}>Slett</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  const Reports = () => {
    const list = db.checks.filter(c=>c.individualId===currentIndividual.id).sort((a,b)=>b.date.localeCompare(a.date));
    return (
      <div className="card">
        <h3>Rapporter – {currentIndividual.name}</h3>
        {list.length===0 && <div className="small">Ingen rapporter.</div>}
        {list.map(y=>(
          <div key={y.id} className="kundeitem">
            <div>
              <div style={{fontWeight:700}}>{y.date} – {y.result}</div>
              <div className="small">{y.inspector}</div>
              {y.photo && <img src={y.photo} className="thumb" alt="Vedlagt bilde"/>}
            </div>
            <div style={{display:'flex',gap:6}}>
              <button className="btn secondary" onClick={()=>exportPdf(y)}>PDF</button>
              <button className="btn danger" onClick={()=>deleteCheck(y.id)}>Slett</button>
            </div>
          </div>
        ))}
        <div style={{marginTop:10}}><button className="btn secondary" onClick={()=>setView('customerDetail')}>Tilbake</button></div>
      </div>
    );
  };

  const NewCheck = () => (
    <div className="card">
      <h3>Ny årskontroll – {currentIndividual?.name}</h3>
      <div className="row two">
        <div><div className="label">Dato</div><input className="input" type="date" value={check.date} onChange={e=>setCheck({...check,date:e.target.value})}/></div>
        <div><div className="label">Kontrollør</div><input className="input" value={check.inspector} onChange={e=>setCheck({...check,inspector:e.target.value})}/></div>
      </div>
      <div className="row two">
        <div><div className="label">Resultat</div><select className="input" value={check.result} onChange={e=>setCheck({...check,result:e.target.value})}><option>OK</option><option>Avvik</option></select></div>
        <div><div className="label">Notater</div><textarea className="input" rows="3" value={check.notes} onChange={e=>setCheck({...check,notes:e.target.value})}></textarea></div>
      </div>
      <div className="divider"></div>
      <div style={{fontWeight:700,marginBottom:6}}>Vedlegg (valgfritt)</div>
      <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:10}}>
        <input type="file" accept="image/*" onChange={async e=>{ const f=e.target.files?.[0]; if(!f)return; const data=await readFileAsDataURL(f); setPhoto(data); }} />
        {photo && <img src={photo} className="thumb" alt="Vedlegg"/>}
      </div>
      <div className="divider"></div>
      <div style={{fontWeight:700,marginBottom:6}}>Sjekkliste</div>
      {items.map((it,idx)=>(
        <div key={it.key} className="kundeitem" style={{alignItems:'flex-start'}}>
          <div style={{flex:1}}>
            <div className="small" style={{fontWeight:700}}>{it.label}</div>
            <input className="input" style={{marginTop:8}} placeholder="Notat (valgfritt)" value={it.notes} onChange={e=>setItems(prev=>prev.map((p,i)=>i===idx?{...p,notes:e.target.value}:p))}/>
          </div>
          <select className="input" style={{width:120}} value={it.status} onChange={e=>setItems(prev=>prev.map((p,i)=>i===idx?{...p,status:e.target.value}:p))}>
            <option>OK</option><option>Avvik</option><option>NA</option>
          </select>
        </div>
      ))}
      <div style={{display:'flex',gap:8,marginTop:10}}>
        <button className="btn secondary" onClick={()=>setView('customerDetail')}>Avbryt</button>
        <button className="btn" onClick={saveCheck}>Lagre kontroll</button>
      </div>
    </div>
  );

  return (
    <>
      {view==='customers' && <Customers/>}
      {view==='customerDetail' && currentCustomer && <CustomerDetail/>}
      {view==='reports' && currentIndividual && <Reports/>}
      {view==='newCheck' && currentIndividual && <NewCheck/>}
    </>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App/>);