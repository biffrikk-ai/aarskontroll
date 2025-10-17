(function(){
  const React = window.React, ReactDOM = window.ReactDOM;
  const { jsPDF } = window.jspdf;
  const e = React.createElement;

  // Helpers
  const LS = 'aarskontroll_store_v20';
  const load = () => { try { return JSON.parse(localStorage.getItem(LS)||'{}'); } catch { return {}; } };
  const debouncedSave = (()=>{ let t=null; return (state)=>{ clearTimeout(t); t=setTimeout(()=>localStorage.setItem(LS, JSON.stringify(state)), 400); }; })();
  const uid = () => Math.random().toString(36).slice(2)+Date.now().toString(36);
  const today = () => new Date().toISOString().slice(0,10);
  const cleanType = (t='') => String(t).replace(/EN\s*\d+(\s*\/\s*EN\d+)*/gi,'').replace(/[–-]\s*/g,'').trim();
  const readFileAsDataURL = (file)=> new Promise((res,rej)=>{ const r=new FileReader(); r.onload=()=>res(r.result); r.onerror=rej; r.readAsDataURL(file); });

  // Forhåndsdefinerte sjekklister
  const CHECKLISTS = {
    'EN361 / EN358 / EN813 – Sele': [
      'Merkelapp/ID lesbar og samsvarer med standard',
      'Bånd/stropper uten kutt, rifter, oppflising eller misfarging',
      'Sømmer intakte – ingen løse tråder',
      'D-ringer/spenner uten rust/deformasjon/skarpe kanter',
      'Justeringspunkter fungerer og holder posisjon',
      'Polstring/festepunkter i god stand',
      'Produsentens etikett/sertifisering lesbar',
      'Utstyr rent/tørt/korrekt lagret',
      'Ingen tegn til overbelastning/fall/modifikasjon'
    ],
    'EN355 – Fangline / Falldemper': [
      'Merkelapp/ID lesbar – EN355',
      'Falldemper ikke utløst/forlenget',
      'Line uten kutt/slitasje/UV/kjemisk skade',
      'Sømmer/termineringer hele',
      'Kroker/karabiner lukker og ikke deformert',
      'Visuell fallindikator ikke aktivert',
      'Lengde og type passer bruksområdet'
    ],
    'EN360 – Fallblokk': [
      'Merkelapp lesbar – EN360',
      'Hus uten sprekker/deformasjon/skade',
      'Wire/bånd uten rust/oppflising/kutt/bøying',
      'Innspoling jevn uten rykk',
      'Brems løser normalt ved trekkprøve',
      'Krok med sikkerhetslås ok',
      'Fallindikator viser ikke utløsning',
      'Siste kontrollmerke oppdatert'
    ],
    'EN353-2 – Linesystem / Vertikal line': [
      'Merkelapp og produsentinfo lesbar – EN353-2',
      'Wire/tau uten kutt/slitasje/oppflising/rust',
      'Løpevogn beveger seg fritt og låser ved falltest',
      'Koblingspunkter og kroker fungerer',
      'Forankringspunkt korrekt og uten skade',
      'Endefester intakte og ikke rustne',
      'System komplett iht. spesifikasjon'
    ],
    'EN358 – Støttesystem': [
      'Merkelapp/ID samsvarer med EN358',
      'Tau/belte uten kutt/rifter/UV/kjemisk påvirkning',
      'Justeringsmekanismer fungerer og holder',
      'Kroker/karabiner lukker og låser korrekt',
      'Sømmer/termineringer uten skade',
      'Bruksområde/merking samsvarer med bruk'
    ],
    'EN354 – Forbindelsesline': [
      'Merkelapp lesbar – EN354',
      'Tau uten kutt/rifter/UV/kjemisk skade',
      'Endefester/sømmer intakte',
      'Kroker fungerer og lukker korrekt',
      'Lengde/type samsvarer med bruk'
    ],
    'EN795 – Forankringsanordning': [
      'Merkelapp og produsentinfo lesbar – EN795',
      'Forankringspunkt fast – uten sprekker/rust/deformasjon',
      'Bolter/fester stramme uten korrosjon',
      'Bevegelige deler fungerer fritt',
      'Plassering korrekt i forhold til arbeid',
      'Kapasitet/WLL iht. dokumentasjon'
    ],
    'EN362 – Koblingsstykke / Karabiner': [
      'Merkelapp/merking lesbar – EN362',
      'Låsemekanisme fungerer – åpner/lukker korrekt',
      'Fjærspenning normal – lukker automatisk',
      'Ingen rust/riper/deformasjoner',
      'Funksjon uten fastklemming'
    ],
    'EN341 – Nedfirings- / Redningsutstyr': [
      'Merkelapp/sertifikat lesbar – EN341',
      'Hus/mekanisme uten skade/korrosjon',
      'Tau/wire uten skader/rifter/knekk',
      'Bremsemekanisme fungerer under test',
      'Kroker/karabiner intakte og funksjonelle',
      'Lengde samsvarer med spesifikasjon',
      'Kontrolldato oppdatert'
    ]
  };
  const PRODUCT_TYPES = Object.keys(CHECKLISTS);

  // UI helpers
  const Button = (props)=> e('button', Object.assign({className:'btn'}, props), props.children);
  const BtnSec = (props)=> e('button', Object.assign({className:'btn secondary'}, props), props.children);
  const BtnDanger = (props)=> e('button', Object.assign({className:'btn danger'}, props), props.children);
  const Card = ({title,children,actions,style})=> e('div', {className:'card', style},
    title? e('h3',null,title): null,
    children,
    actions? e('div',{style:{marginTop:8,display:'flex',gap:8,flexWrap:'wrap'}}, actions): null
  );
  const L = (txt)=> e('div',{className:'label'},txt);
  const Input = (props)=> e('input', Object.assign({className:'input'}, props));
  const TextArea = (props)=> e('textarea', Object.assign({className:'input'}, props));
  const Select = (props)=> e('select', Object.assign({className:'input'}, props));

  function App(){
    const [db, setDb] = React.useState(()=>({customers:[], individuals:[], checks:[], items:[], ...load()}));
    React.useEffect(()=>debouncedSave(db),[db]); // stabiliserer input på mobil

    const [view, setView] = React.useState('customers');
    const [currentCustomer, setCurrentCustomer] = React.useState(null);
    const [currentIndividual, setCurrentIndividual] = React.useState(null);

    // Skjemastate (lokal)
    const [cust, setCust] = React.useState({name:'',contact:'',phone:'',email:'',orgnr:'',street:'',zip:'',city:''});
    const [ind, setInd] = React.useState({name:'',type:'',serial:'',notes:''});
    const [check, setCheck] = React.useState({date:today(),inspector:'',result:'OK',notes:''});
    const [items, setItems] = React.useState([]);
    const [photo, setPhoto] = React.useState(null);

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

    // Customers
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

    // Individuals
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
      if (currentIndividual && currentIndividual.id===id){ setCurrentIndividual(null); setView('customerDetail'); }
    };

    // Checks
    const startChecklist = (individual)=>{
      setCurrentIndividual(individual);
      const base = (CHECKLISTS[individual.type]||[]).map((label,i)=>({key:'k'+i,label,status:'OK',notes:''}));
      setItems(base);
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

      if (y.photo) {
        try { const fmt = y.photo.startsWith('data:image/png') ? 'PNG' : 'JPEG';
          const imgW = 400; const imgH = 260;
          doc.text('Bilde:', margin, yPos); yPos+=10;
          doc.addImage(y.photo, fmt, margin, yPos, imgW, imgH, undefined, 'FAST');
          yPos += imgH + 10;
        } catch(e){}
      }

      yPos+=6; doc.setFontSize(12); doc.text('Sjekkliste', margin, yPos); yPos+=12;
      const colW = [ (pageW-margin*2)*0.58, (pageW-margin*2)*0.12, (pageW-margin*2)*0.30 ];
      doc.setDrawColor(180); doc.setLineWidth(0.8);
      [['Punkt','Status','Notat']].forEach(h=>{
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
      const f = [
        'Petersson Industri og Service',
        'Smed Qvales vei 19b, 8012 Bodø',
        'Tlf: +47 911 28 084 – E-post: bjorn.petersson@outlook.com',
        'Org.nr: 933 939 871 MVA'
      ];
      let fy = footerY+14; f.forEach(t=>{doc.text(t, margin, fy); fy+=14;});
      const blob = doc.output('blob');
      const filename = `aarskontroll_${(cust.name||'kunde').replace(/[^a-z0-9]+/gi,'-').toLowerCase()}_${(indiv.name||'individ').replace(/[^a-z0-9]+/gi,'-').toLowerCase()}_${y.date.replace(/-/g,'')}.pdf`;
      if (navigator.share && navigator.canShare && navigator.canShare({ files: [new File([blob], filename, {type: 'application/pdf'})] })) {
        const file = new File([blob], filename, {type:'application/pdf'});
        navigator.share({ title: filename, text: 'Årskontroll-rapport', files: [file] }).catch(()=>doc.save(filename));
      } else {
        doc.save(filename);
        const subject = encodeURIComponent(`Årskontroll – ${cust.name||''} – ${y.date}`);
        const body = encodeURIComponent('Hei,\n\nSe vedlagt rapport.\n\nMvh\nPetersson Industri og Service');
        const to = encodeURIComponent(cust.email||'');
        window.location.href = `mailto:${to}?subject=${subject}&body=${body}`;
      }
    };

    // Views
    const Customers = ()=> e('div',{className:'grid two'},
      e(Card,{title:'Kunder'},
        e('div',{style:{display:'flex',gap:8,flexWrap:'wrap',marginBottom:8}},
          e(BtnSec,{onClick:exportBackup},'Eksporter backup (JSON)'),
          e('label',{className:'btn secondary',style:{display:'inline-flex',alignItems:'center',gap:8,cursor:'pointer'}},
            'Importer backup',
            e('input',{type:'file',accept:'application/json',style:{display:'none'},onChange:(ev)=>{const f=ev.target.files&&ev.target.files[0]; if(f) importBackup(f); }})
          )
        ),
        db.customers.length===0? e('div',{className:'small'},'Ingen kunder enda.'): null,
        e('ul',{style:{listStyle:'none',padding:0,margin:0}},
          db.customers.map(c => e('li',{key:c.id,className:'kundeitem'},
            e('div',{onClick:()=>{setCurrentCustomer(c); setView('customerDetail');}, style:{cursor:'pointer'}},
              e('div',{style:{fontWeight:800}},c.name),
              e('div',{className:'small'}, [c.street,[c.zip,c.city].filter(Boolean).join(' ')].filter(Boolean).join(', ')),
              e('div',{className:'small'}, `Kontakt: ${c.contact||'-'} · ${c.phone||'-'}`)
            ),
            e('div',{style:{display:'flex',gap:6}},
              e(BtnSec,{onClick:()=>{
                const name=prompt('Kundenavn', c.name); if(name===null)return;
                const contact=prompt('Kontaktperson', c.contact||''); if(contact===null)return;
                const phone=prompt('Telefon', c.phone||''); if(phone===null)return;
                const email=prompt('E-post', c.email||''); if(email===null)return;
                const orgnr=prompt('Org.nr', c.orgnr||''); if(orgnr===null)return;
                const street=prompt('Gateadresse', c.street||''); if(street===null)return;
                const zip=prompt('Postnr', c.zip||''); if(zip===null)return;
                const city=prompt('Poststed', c.city||''); if(city===null)return;
                setDb(s=>({...s, customers: s.customers.map(x=>x.id===c.id?{...c,name,contact,phone,email,orgnr,street,zip,city}:x)}));
              }},'Rediger'),
              e(BtnDanger,{onClick:()=>deleteCustomer(c.id)},'Slett')
            )
          ))
        )
      ),
      e(Card,{title:'Ny kunde'},
        e('div',{className:'row three'},
          e('div',null, L('Kundenavn'), Input({value:cust.name,onInput:e=>setCust({...cust,name:e.target.value})})),
          e('div',null, L('Kontaktperson'), Input({value:cust.contact,onInput:e=>setCust({...cust,contact:e.target.value})})),
          e('div',null, L('Telefon'), Input({value:cust.phone,onInput:e=>setCust({...cust,phone:e.target.value})}))
        ),
        e('div',{className:'row three'},
          e('div',null, L('E-post'), Input({value:cust.email,onInput:e=>setCust({...cust,email:e.target.value})})),
          e('div',null, L('Org.nr'), Input({value:cust.orgnr,onInput:e=>setCust({...cust,orgnr:e.target.value})}))
        ),
        e('div',{className:'row three'},
          e('div',null, L('Gateadresse'), Input({value:cust.street,onInput:e=>setCust({...cust,street:e.target.value})})),
          e('div',null, L('Postnr'), Input({value:cust.zip,onInput:e=>setCust({...cust,zip:e.target.value})})),
          e('div',null, L('Poststed'), Input({value:cust.city,onInput:e=>setCust({...cust,city:e.target.value})}))
        ),
        e('div',{style:{marginTop:10}}, e(Button,{onClick:addCustomer},'Lagre kunde'))
      )
    );

    const CustomerDetail = ()=>{
      const inds = db.individuals.filter(i=>i.customerId===currentCustomer.id);
      const checks = db.checks.filter(y=>inds.some(i=>i.id===y.individualId)).sort((a,b)=>b.date.localeCompare(a.date));
      return e('div',{className:'grid two'},
        e(Card,{title:'Kunde'},
          e('div',{style:{fontWeight:800,fontSize:18}}, currentCustomer.name),
          e('div',{className:'small'}, [currentCustomer.street,[currentCustomer.zip,currentCustomer.city].filter(Boolean).join(' ')].filter(Boolean).join(', ')),
          e('div',{className:'small'}, `Kontakt: ${currentCustomer.contact||'-'} · ${currentCustomer.phone||'-'}`),
          e('div',{className:'small'}, `E-post: ${currentCustomer.email||'-'} · Org.nr: ${currentCustomer.orgnr||'-'}`),
          e('div',{className:'divider'}),
          e(BtnSec,{onClick:()=>setView('customers')},'Tilbake')
        ),
        e(Card,{title:'Legg til individ'},
          e('div',{className:'row two'},
            e('div',null, L('Navn / betegnelse'), Input({value:ind.name,onInput:e=>setInd({...ind,name:e.target.value})})),
            e('div',null, L('Serienummer'), Input({value:ind.serial,onInput:e=>setInd({...ind,serial:e.target.value})}))
          ),
          e('div',{className:'row two'},
            e('div',null, L('Type produkt'),
              e(Select,{value:ind.type,onInput:e=>setInd({...ind,type:e.target.value})},
                e('option',{value:''},'Velg …'),
                ...PRODUCT_TYPES.map(t=>e('option',{key:t,value:t},t))
              )
            ),
            e('div',null, L('Notater'), TextArea({rows:3,value:ind.notes,onInput:e=>setInd({...ind,notes:e.target.value})}))
          ),
          e('div',{style:{marginTop:10}}, Button({onClick:addIndividual},'Lagre individ'))
        ),
        e(Card,{title:'Individer', style:{gridColumn:'1 / -1'}},
          inds.length===0? e('div',{className:'small'},'Ingen individer registrert.'): null,
          e('ul',{style:{listStyle:'none',padding:0,margin:0}},
            inds.map(i=>{
              const last = db.checks.filter(y=>y.individualId===i.id).sort((a,b)=>b.date.localeCompare(a.date))[0];
              return e('li',{key:i.id,className:'kundeitem'},
                e('div',null,
                  e('div',{style:{fontWeight:800}}, i.name),
                  e('div',{className:'small'}, `${cleanType(i.type)} ${i.serial?`· SN: ${i.serial}`:''}`),
                  e('div',{className:'small'}, `Sist kontroll: ${last?`${last.date} – ${last.result}`:'–'}`)
                ),
                e('div',{style:{display:'flex',gap:6}},
                  BtnSec({onClick:()=>{ setCurrentIndividual(i); setView('reports'); }},'Se rapporter'),
                  Button({onClick:()=>startChecklist(i)},'Ny årskontroll'),
                  BtnSec({onClick:()=>{
                    const name=prompt('Navn', i.name); if(name===null)return;
                    const type=prompt('Type', i.type); if(type===null)return;
                    const serial=prompt('Serienummer', i.serial||''); if(serial===null)return;
                    const notes=prompt('Notater', i.notes||''); if(notes===null)return;
                    setDb(s=>({...s, individuals: s.individuals.map(x=>x.id===i.id?{...i,name,type,serial,notes}:x)}));
                  }},'Rediger'),
                  BtnDanger({onClick:()=>deleteIndividual(i.id)},'Slett')
                )
              );
            })
          )
        ),
        checks.length>0 ? e(Card,{title:'Siste rapporter', style:{gridColumn:'1 / -1'}},
          ...checks.slice(0,5).map(y=> e('div',{key:y.id,className:'kundeitem'},
            e('div',null,
              e('div',{style:{fontWeight:700}}, `${y.date} – ${y.result}`),
              e('div',{className:'small'}, db.individuals.find(i=>i.id===y.individualId)?.name || ''),
              y.photo ? e('img',{src:y.photo, className:'thumb', alt:'Vedlagt bilde'}) : null
            ),
            e('div',{style:{display:'flex',gap:6}},
              BtnSec({onClick:()=>{
                const inspector=prompt('Kontrollør', y.inspector||''); if(inspector===null)return;
                const result=prompt('Resultat (OK/Avvik)', y.result||'OK'); if(result===null)return;
                const notes=prompt('Notater', y.notes||''); if(notes===null)return;
                setDb(s=>({...s, checks: s.checks.map(c=>c.id===y.id?{...c,inspector,result,notes}:c)}));
              }},'Rediger'),
              BtnSec({onClick:()=>exportPdf(y)},'PDF'),
              BtnDanger({onClick:()=>deleteCheck(y.id)},'Slett')
            )
          ))
        ): null
      );
    };

    const Reports = ()=>{
      const list = db.checks.filter(c=>c.individualId===currentIndividual.id).sort((a,b)=>b.date.localeCompare(a.date));
      return Card({title:`Rapporter – ${currentIndividual.name}`},
        list.length===0? e('div',{className:'small'},'Ingen rapporter.'): null,
        ...list.map(y=> e('div',{key:y.id,className:'kundeitem'},
          e('div',null,
            e('div',{style:{fontWeight:700}}, `${y.date} – ${y.result}`),
            e('div',{className:'small'}, y.inspector || ''),
            y.photo ? e('img',{src:y.photo,className:'thumb',alt:'Vedlagt bilde'}) : null
          ),
          e('div',{style:{display:'flex',gap:6}} ,
            BtnSec({onClick:()=>exportPdf(y)},'PDF'),
            BtnDanger({onClick:()=>deleteCheck(y.id)},'Slett')
          )
        )),
        e('div',{style:{marginTop:10}}, BtnSec({onClick:()=>setView('customerDetail')},'Tilbake'))
      );
    };

    const NewCheck = ()=> Card({title:`Ny årskontroll – ${currentIndividual? currentIndividual.name:''}`},
      e('div',{className:'row two'},
        e('div',null, L('Dato'), Input({type:'date',value:check.date,onInput:ev=>setCheck({...check,date:ev.target.value})})),
        e('div',null, L('Kontrollør'), Input({value:check.inspector,onInput:ev=>setCheck({...check,inspector:ev.target.value})}))
      ),
      e('div',{className:'row two'},
        e('div',null, L('Resultat'),
          Select({value:check.result,onInput:ev=>setCheck({...check,result:ev.target.value})}},
            e('option',null,'OK'),
            e('option',null,'Avvik')
          )
        ),
        e('div',null, L('Notater'), TextArea({rows:3,value:check.notes,onInput:ev=>setCheck({...check,notes:ev.target.value})}))
      ),
      e('div',{className:'divider'}),
      e('div',{style:{fontWeight:700,marginBottom:6}},'Vedlegg (valgfritt)'),
      e('div',{style:{display:'flex',alignItems:'center',gap:10,marginBottom:10}},
        e('input',{type:'file',accept:'image/*',onChange:async ev=>{ const f=ev.target.files&&ev.target.files[0]; if(!f)return; const data=await readFileAsDataURL(f); setPhoto(data); }}),
        photo ? e('img',{src:photo,className:'thumb',alt:'Vedlegg'}) : null
      ),
      e('div',{className:'divider'}),
      e('div',{style:{fontWeight:700,marginBottom:6}},'Sjekkliste'),
      ...items.map((it,idx)=> e('div',{key:it.key,className:'kundeitem'},
        e('div',{style:{flex:1}},
          e('div',{className:'small',style:{fontWeight:700}}, it.label),
          Input({style:{marginTop:8},placeholder:'Notat (valgfritt)',value:it.notes,onInput:ev=>setItems(prev=>prev.map((p,i)=>i===idx?Object.assign({},p,{notes:ev.target.value}):p))})
        ),
        Select({style:{width:120},value:it.status,onInput:ev=>setItems(prev=>prev.map((p,i)=>i===idx?Object.assign({},p,{status:ev.target.value}):p))}},
          e('option',null,'OK'), e('option',null,'Avvik'), e('option',null,'NA')
        )
      )),
      e('div',{style:{display:'flex',gap:8,marginTop:10}},
        BtnSec({onClick:()=>setView('customerDetail')},'Avbryt'),
        Button({onClick:saveCheck},'Lagre kontroll')
      )
    );

    return e(React.Fragment,null,
      view==='customers' && e(Customers),
      view==='customerDetail' && currentCustomer && e(CustomerDetail),
      view==='reports' && currentIndividual && e(Reports),
      view==='newCheck' && currentIndividual && e(NewCheck)
    );
  }

  ReactDOM.createRoot(document.getElementById('root')).render(e(App));
})();