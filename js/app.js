(function(){
'use strict';
const DB=window.PT_CATALOGUE;
if(!DB){document.body.innerHTML='<div class="fatal">Catalogue data did not load. Keep data/catalogue-data.js beside index.html.</div>';return;}

const $=s=>document.querySelector(s), $$=s=>Array.from(document.querySelectorAll(s));
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const selectionButton=d=>`<button type="button" data-select-device="${d.device_id}" title="${esc('Add '+d.display_name+' to selected components')}" aria-label="${esc('Add '+d.display_name+' to selected components')}"><img class="button-icon" src="assets/icons/plus.svg" alt="" aria-hidden="true"> Add to selection</button>`;
const stateLabel=s=>({native:'✓ Native',configuration_required:'⚙ Configuration',module_required:'◐ Module',module_and_configuration:'◐⚙ Module + config',unsupported:'✗ Unsupported',unknown:'? Unknown'}[s]||s);
const verifyBadge=v=>`<span class="badge ${v==='Verified'?'good':'neutral'}">${esc(v||'Unknown')}</span>`;
const categoryBySlug=Object.fromEntries(DB.categories.map(c=>[c.slug,c]));
const deviceById=Object.fromEntries(DB.devices.map(d=>[d.device_id,d]));
let compareIds=[];
let browseSort={key:'display_name',dir:1};
let targetVersion='';
let activeModalId=null;
let modalReturnFocus=null;
let modalBackgroundState=[];
let modalBodyOverflow='';
const versionStorageKey='ptCatalogue.targetVersion';
const majorVersions=['6','7','8','9'];

function availability(d,major=targetVersion){const a=d.version_profiles?.[major]?.availability;return a?{...a,notes:a.support_notes||a.notes||''}:{available:null,verification_status:'Unknown',notes:'No version-specific evidence recorded.'};}
function availabilityState(a){return a.available===true||a.available===1?'available':a.available===false||a.available===0?'unavailable':'unknown';}
function versionAllowed(d){return !targetVersion||availabilityState(availability(d))!=='unavailable';}
function contextDevice(d){
  if(!targetVersion)return d;
  const p=d.version_profiles?.[targetVersion];
  if(!p||availabilityState(availability(d))!=='available')return {...d,description:'',typical_use:'',roles:[],interfaces:[],features:[],modules:[],limitations:[],port_totals:{},total_physical_ports:0,feature_map:{},max_module_port_additions:{},max_module_total_ports:0,interface_verification_status:'Unknown',verification_status:'Unknown'};
  const status=p.availability.verification_status==='Unknown'?'Unknown':p.availability.verification_status==='Verified'&&d.verification_status==='Verified'?'Verified':'Partial';
  return {...d,...p,description:'',verification_status:status};
}
function visibleDevices(){return DB.devices.filter(versionAllowed).map(contextDevice);}
function searchableText(d){return [d.display_name,d.pt_name,d.model,d.family,d.category.name,d.layer_capability,...d.aliases,...d.roles.map(r=>r.name),...d.features.filter(f=>f.support_mode!=='unsupported').map(f=>f.name),...d.interfaces.map(i=>i.name),...d.modules.map(m=>m.model)].filter(Boolean).join(' ').toLowerCase();}
function featureText(f){if(!f)return '? Unknown';return stateLabel(f.support_mode)+(f.verification_status!=='Verified'?' ('+(f.verification_status||'Unknown')+')':'');}
function contextWarning(d){if(targetVersion&&availabilityState(availability(d))==='unavailable')return 'This device is not available in the selected version family.';const notes=[];if(targetVersion&&availabilityState(availability(d))==='unknown')notes.push('Device availability is not verified for this version.');if(d.interface_verification_status!=='Verified')notes.push('Port data is '+(d.interface_verification_status||'Unknown').toLowerCase()+(targetVersion?' for this version':' in the combined catalogue')+'; confirm in Packet Tracer.');return notes.join(' ');}
function availabilityText(d,major=targetVersion){
  if(!major){const known=majorVersions.filter(v=>availabilityState(availability(d,v))==='available');return known.length?known.map(v=>v+'.x').join(', '):'Not verified';}
  const state=availabilityState(availability(d,major));
  return state==='available'?'Available in '+major+'.x':state==='unavailable'?'Not available in '+major+'.x':'Not verified for '+major+'.x';
}
function availabilityBadge(d,major=targetVersion){
  const a=availability(d,major),state=availabilityState(a);
  const cls=!major?'neutral':state==='available'?(a.verification_status==='Verified'?'good':'warn'):state==='unavailable'?'bad':'neutral';
  return `<span class="badge ${cls}" title="${esc(major?a.verification_status+'. '+(a.observed_release?`Evidence release: ${a.observed_release}. `:'')+(a.notes||''):'Documented version families')}">${esc(availabilityText(d,major)+(major&&a.verification_status==='Partial'?' (Partial)':''))}</span>`;
}
function availabilityCell(d,major){
  const a=availability(d,major);
  return `<div class="availability-cell">${availabilityBadge(d,major)}<small>${esc(a.verification_status)}${a.observed_release?' · '+esc(a.observed_release):''}</small>${a.source_url?`<small>${sourceLink(a.source_url,a.source_title,a.source_publisher)}</small>`:''}</div>`;
}
function renderVersionAudit(){
  $('#versionCoverageSummary').textContent=DB.devices.length+' devices · '+(DB.devices.length*majorVersions.length)+' device/version assessments';
  $('#versionAuditBody').innerHTML=DB.devices.map(d=>`<tr><td><button data-device-id="${d.device_id}">${esc(d.display_name)}</button></td>${majorVersions.map(v=>`<td>${availabilityCell(d,v)}</td>`).join('')}</tr>`).join('');
}
function renderHeader(){
  const ds=visibleDevices();
  const unknown=targetVersion?ds.filter(d=>availabilityState(availability(d))==='unknown').length:0;
  const moduleCount=targetVersion?new Set(ds.flatMap(d=>d.modules.map(m=>m.module_id))).size:DB.stats.modules;
  $('#headerMeta').innerHTML=`<strong>${ds.length}</strong> devices · <strong>${moduleCount}</strong> modules<br>${targetVersion?`PT ${esc(targetVersion)}.x · ${ds.length-unknown} available · ${unknown} not verified`:esc(DB.metadata.packet_tracer_versions_covered)}`;
}
function refreshDeviceOptions(){
  ['compareDeviceSelect','moduleDeviceSelect','connDeviceA','connDeviceB'].forEach(id=>{const element=$('#'+id),previous=element.value;element.innerHTML=deviceOptions(id==='connDeviceA'?'Device A':id==='connDeviceB'?'Device B':'Select device');element.value=visibleDevices().some(d=>String(d.device_id)===previous)?previous:'';});
}
function changeVersion(){
  targetVersion=$('#versionFilter').value;
  try{window.localStorage.setItem(versionStorageKey,targetVersion);}catch{}
  refreshDeviceOptions();renderHeader();renderBrowse();renderFinder();renderCompare();renderModuleLookups();renderConnections();
  window.PTBuilderUI?.versionChanged();
  if(activeModalId!==null)openDevice(activeModalId);
}

function optionList(items,valueKey,labelKey,first='Any'){
  return `<option value="">${first}</option>`+items.map(x=>`<option value="${esc(x[valueKey])}">${esc(x[labelKey])}</option>`).join('');
}
function deviceOptions(first='Select device'){
  return `<option value="">${first}</option>`+visibleDevices().map(d=>`<option value="${d.device_id}">${esc(d.display_name)}${targetVersion&&availabilityState(availability(d))==='unknown'?' (not verified)':''}</option>`).join('');
}
function init(){
  try{const saved=window.localStorage.getItem(versionStorageKey);if(majorVersions.includes(saved))targetVersion=saved;}catch{}
  $('#versionFilter').value=targetVersion;
  renderHeader();
  $('#footerVersion').textContent=`Catalogue ${DB.metadata.catalogue_version} · schema ${DB.metadata.schema_version}`;
  $('#aboutStats').innerHTML=`<div class="kv"><dt>Devices</dt><dd>${DB.stats.devices}</dd><dt>Modules</dt><dd>${DB.stats.modules}</dd><dt>Features</dt><dd>${DB.stats.features}</dd><dt>Sources</dt><dd>${DB.stats.sources}</dd><dt>Coverage</dt><dd>${esc(DB.metadata.packet_tracer_versions_covered)}</dd><dt>Generated</dt><dd>${esc(DB.metadata.generated_at)}</dd></div>`;

  $('#reqCategory').innerHTML=optionList(DB.categories,'slug','name');
  $('#browseCategory').innerHTML=optionList(DB.categories,'slug','name');
  $('#browseFeature').innerHTML=optionList(DB.featureCatalog,'slug','name');
  $('#compareDeviceSelect').innerHTML=deviceOptions();
  $('#moduleDeviceSelect').innerHTML=deviceOptions();
  $('#moduleSelect').innerHTML=`<option value="">Select module</option>`+DB.modules.map(m=>`<option value="${m.module_id}">${esc(m.model)}</option>`).join('');
  $('#connDeviceA').innerHTML=deviceOptions('Device A');
  $('#connDeviceB').innerHTML=deviceOptions('Device B');
  renderFeatureSelector();renderSources();renderVersionAudit();renderBrowse();renderFinder();renderCompare();renderModuleLookups();
  bindEvents();
  window.PTBuilderUI?.init({db:DB,getVersion:()=>targetVersion,onVersionChange:major=>{$('#versionFilter').value=major;changeVersion();},onOpenBuilder:()=>showView('builder'),onCountChange:count=>{$('#builderCount').textContent=String(count);}});
}

function bindEvents(){
  $('#versionFilter').addEventListener('change',changeVersion);
  $$('.tab').forEach(b=>b.addEventListener('click',()=>showView(b.dataset.view)));
  $('#findDevicesBtn').addEventListener('click',renderFinder);
  ['reqCategory','reqLayer','reqTotalPorts','reqFE','reqGE','req10GE','reqSerial','reqSFP','reqAllowModules','reqIncludePartial'].forEach(id=>$('#'+id).addEventListener('change',renderFinder));
  $('#reqFeatures').addEventListener('change',renderFinder);
  ['browseSearch','browseCategory','browseLayer','browseFeature','browseVerification'].forEach(id=>$('#'+id).addEventListener(id==='browseSearch'?'input':'change',renderBrowse));
  $('#deviceTable').querySelectorAll('th[data-sort]').forEach(th=>th.addEventListener('click',()=>{const k=th.dataset.sort;if(browseSort.key===k)browseSort.dir*=-1;else browseSort={key:k,dir:1};renderBrowse();}));
  $('#compareCheckedBtn').addEventListener('click',()=>{const ids=$$('#deviceTableBody input[type=checkbox]:checked').map(x=>Number(x.value));if(ids.length){compareIds=ids.slice(0,4);renderCompare();showView('compare');}});
  $('#addCompareBtn').addEventListener('click',()=>{const id=Number($('#compareDeviceSelect').value);if(id&&!compareIds.includes(id)&&compareIds.length<4){compareIds.push(id);renderCompare();renderBrowse();}});
  $('#clearCompareBtn').addEventListener('click',()=>{compareIds=[];renderCompare();renderBrowse();});
  $('#moduleDeviceSelect').addEventListener('change',renderModuleLookups);$('#moduleSelect').addEventListener('change',renderModuleLookups);
  $('#connectionBtn').addEventListener('click',renderConnections);$('#connDeviceA').addEventListener('change',renderConnections);$('#connDeviceB').addEventListener('change',renderConnections);$('#connAllowModules').addEventListener('change',renderConnections);
  document.addEventListener('click',e=>{const t=e.target.closest('[data-device-id]');if(t)openDevice(Number(t.dataset.deviceId));if(e.target.matches('[data-close-modal]'))closeModal();const r=e.target.closest('[data-remove-compare]');if(r){compareIds=compareIds.filter(x=>x!==Number(r.dataset.removeCompare));renderCompare();renderBrowse();}});
  document.addEventListener('keydown',handleModalKeydown);
  document.addEventListener('click',e=>{
    const device=e.target.closest('[data-select-device]'),part=e.target.closest('[data-select-module]');
    const added=device?window.PTBuilderUI?.addDevice(Number(device.dataset.selectDevice)):part?window.PTBuilderUI?.addModule(Number(part.dataset.selectModule),Number(part.dataset.forDeviceId)||undefined):false;
    if(added){const button=device||part;button.innerHTML='<img class="button-icon" src="assets/icons/check.svg" alt="" aria-hidden="true"> Added - add another';button.setAttribute('aria-label','Added to selected components. Add another.');}
  });
}
function showView(name){$$('.tab').forEach(b=>b.classList.toggle('active',b.dataset.view===name));$$('.view').forEach(v=>v.classList.toggle('active',v.id===`view-${name}`));window.scrollTo({top:0,behavior:'smooth'});}

function renderFeatureSelector(){
  const groups={};DB.featureCatalog.forEach(f=>(groups[f.category_name]??=[]).push(f));
  $('#reqFeatures').innerHTML=Object.entries(groups).map(([name,items])=>`<div class="feature-group"><strong>${esc(name)}</strong><div class="feature-checks">${items.map(f=>`<label><input type="checkbox" value="${esc(f.slug)}"> <span>${esc(f.name)}</span></label>`).join('')}</div></div>`).join('');
}
function selectedFeatureSlugs(){return $$('#reqFeatures input:checked').map(x=>x.value);}
function requirements(){return {category:$('#reqCategory').value,layer:$('#reqLayer').value,total:+$('#reqTotalPorts').value||0,fastethernet:+$('#reqFE').value||0,gigabitethernet:+$('#reqGE').value||0,tengigabit:+$('#req10GE').value||0,serial:+$('#reqSerial').value||0,gigabit_sfp:+$('#reqSFP').value||0,allowModules:$('#reqAllowModules').checked,includePartial:$('#reqIncludePartial').checked,features:selectedFeatureSlugs()};}
function layerMatches(d,req){if(!req)return true;if(req==='L3')return /L3/.test(d.layer_capability);if(req==='L2')return /L2/.test(d.layer_capability);return true;}
function verifiedModuleAddition(d,slug){let maximum=0;d.modules.filter(m=>m.verification_status==='Verified').forEach(m=>{const count=m.interfaces.filter(i=>slug==='total'?i.slug!=='wireless':i.slug===slug).reduce((n,i)=>n+(i.quantity||0),0)*(m.max_quantity||1);maximum=Math.max(maximum,count);});return maximum;}
function evalDevice(d,r){
  const reasons=[];let fail=false,module=false,config=false,unknown=false;
  const pass=(txt,cls='pass')=>reasons.push({txt,cls});
  if(targetVersion){const state=availabilityState(availability(d));if(state==='unknown'||availability(d).verification_status!=='Verified'){unknown=true;pass(availabilityText(d)+' ('+availability(d).verification_status+')','unknown');}else pass(availabilityText(d));}
  if(r.category&&d.category.slug!==r.category){fail=true;pass(`Category is ${d.category.name}, not ${categoryBySlug[r.category]?.name||r.category}`,'fail');}
  else if(r.category)pass(`Category: ${d.category.name}`);
  if(r.layer&&!layerMatches(d,r.layer)){fail=true;pass(`Layer capability ${d.layer_capability} does not satisfy ${r.layer}`,'fail');}else if(r.layer)pass(`Layer capability: ${d.layer_capability}`);
  const portReqs=[['total','total physical ports',r.total],['fastethernet','FastEthernet',r.fastethernet],['gigabitethernet','GigabitEthernet',r.gigabitethernet],['tengigabit','10 Gigabit',r.tengigabit],['serial','Serial',r.serial],['gigabit_sfp','SFP/fiber',r.gigabit_sfp]];
  portReqs.forEach(([slug,label,min])=>{if(!min)return;const built=slug==='total'?d.total_physical_ports:(d.port_totals[slug]||0);let extra=0;if(r.allowModules){if(slug==='total')extra=d.max_module_total_ports||0;else extra=d.max_module_port_additions?.[slug]||0;}
    if(d.interface_verification_status!=='Verified'){unknown=true;pass(d.interfaces.length?`${built} recorded ${label}${extra?` (+ up to ${extra} via recorded modules)`:''}; need ${min}. Port data is ${d.interface_verification_status||'Unknown'}; verify in Packet Tracer${targetVersion?' '+targetVersion+'.x':''}.`:`${label}: no verified interface data${targetVersion?' for PT '+targetVersion+'.x':''} (need ${min})`,'unknown');return;}
    if(built>=min)pass(`${built} built-in ${label} (need ${min})`);
    else if(r.allowModules&&built+extra>=min){if(built+verifiedModuleAddition(d,slug)<min){unknown=true;pass(`${built} built-in ${label}; recorded expansion may reach ${min}, but module compatibility needs verification`,'unknown');}else{module=true;pass(`${built} built-in + module expansion can reach ${min} ${label}`,'module');}}
    else if(r.allowModules&&d.is_modular&&(!d.modules.length||d.modules.some(m=>m.verification_status!=='Verified'))){unknown=true;pass(`${built} recorded ${label}; need ${min}. Expansion compatibility is not fully verified${targetVersion?' for PT '+targetVersion+'.x':' in the combined catalogue'}.`,'unknown');}
    else{fail=true;pass(`Only ${built}${extra?` (+ up to ${extra} via modules)`:''} ${label}; need ${min}`,'fail');}
  });
  r.features.forEach(slug=>{const cat=DB.featureCatalog.find(x=>x.slug===slug);const f=d.feature_map[slug];if(!f){unknown=true;pass(`${cat?.name||slug}: not yet verified`,'unknown');return;}
    if(f.verification_status!=='Verified'){unknown=true;pass(`${f.name}: recorded as ${stateLabel(f.support_mode)}; ${f.verification_status||'Unknown'} evidence${targetVersion?' for PT '+targetVersion+'.x':''}`,'unknown');return;}
    if(f.support_mode==='unsupported'){fail=true;pass(`${f.name}: unsupported`,'fail');}
    else if(f.support_mode==='unknown'){unknown=true;pass(`${f.name}: unknown`,'unknown');}
    else if(f.support_mode==='module_required'||f.support_mode==='module_and_configuration'){if(!r.allowModules){fail=true;pass(`${f.name}: requires a module, but module matching is disabled`,'fail');}else if(!d.modules.some(m=>(!f.required_module_id||m.module_id===f.required_module_id)&&m.verification_status==='Verified')){unknown=true;pass(`${f.name}: no compatible module verified${targetVersion?' for PT '+targetVersion+'.x':''}`,'unknown');}else{module=true;pass(`${f.name}: ${stateLabel(f.support_mode)}${f.required_module?` (${f.required_module})`:''}`,'module');}}
    else if(f.support_mode==='configuration_required'){config=true;pass(`${f.name}: requires configuration`,'pass');}
    else pass(`${f.name}: native`);
  });
  if(!r.includePartial&&(d.verification_status!=='Verified'||unknown)){fail=true;pass('Unverified or partial evidence excluded','fail');}
  let cls,label;if(fail){cls='no';label='No full match';}else if(unknown){cls='partial';label='Partial / verify';}else if(module){cls='module';label='Match with module';}else if(config){cls='config';label='Match with configuration';}else{cls='native';label='Native match';}
  const score=reasons.reduce((n,x)=>n+(x.cls==='pass'?2:x.cls==='module'?1:x.cls==='unknown'?0:-4),0);
  return {d,reasons,cls,label,score};
}
function renderFinder(){
  const r=requirements();let out=visibleDevices().map(d=>evalDevice(d,r));
  const hasReq=!!(targetVersion||r.category||r.layer||r.total||r.fastethernet||r.gigabitethernet||r.tengigabit||r.serial||r.gigabit_sfp||r.features.length);
  if(hasReq)out.sort((a,b)=>({native:0,config:1,module:2,partial:3,no:4}[a.cls]-{native:0,config:1,module:2,partial:3,no:4}[b.cls]||b.score-a.score||a.d.display_name.localeCompare(b.d.display_name)));
  else out.sort((a,b)=>a.d.display_name.localeCompare(b.d.display_name));
  const matches=out.filter(x=>x.cls!=='no').length;$('#finderSummary').innerHTML=hasReq?`<span><strong>${matches}</strong> possible matches from ${out.length} devices${targetVersion?' for PT '+targetVersion+'.x':''}</span><span class="muted">Unknown data is shown as “verify”, never assumed supported.</span>`:`<span>Set requirements above. Showing all ${out.length} devices.</span>`;
  $('#finderResults').innerHTML=out.map(x=>matchCard(x,hasReq)).join('')||'<p class="empty-state">No devices recorded for this version.</p>';
}
function matchCard(x,showReasons){const d=x.d;return `<article class="match-card ${x.cls}"><div class="match-head"><div><h3>${esc(d.display_name)}</h3><p>${esc(d.category.name)} · ${esc(d.layer_capability)} · ${portsText(d)}</p>${targetVersion?availabilityBadge(d):''}</div><div><span class="badge ${x.cls==='no'?'bad':x.cls==='module'?'warn':x.cls==='native'?'good':'neutral'}">${esc(showReasons?x.label:d.verification_status)}</span></div></div>${showReasons?`<div class="reason-grid">${x.reasons.map(r=>`<div class="reason ${r.cls}">${r.cls==='fail'?'✗':r.cls==='module'?'◐':r.cls==='unknown'?'?':'✓'} ${esc(r.txt)}</div>`).join('')}</div>`:''}<div class="card-actions"><button data-device-id="${d.device_id}">Device details</button><button data-add-compare="${d.device_id}">Compare</button>${selectionButton(d)}</div></article>`;}

function portsText(d){const parts=[];const names={fastethernet:'FE',gigabitethernet:'GE',tengigabit:'10GE',gigabit_sfp:'SFP',serial:'Serial',management_ge:'Mgmt GE',wireless:'Radio',cellular:'Cellular',coaxial:'Coax',modem:'Modem',ethernet10:'Eth'};for(const [k,v] of Object.entries(d.port_totals||{}))if(v)parts.push(`${v}× ${names[k]||k}`);const text=parts.length?parts.join(' · '):targetVersion?'Port data not verified':'No fixed ports recorded';return text+(parts.length&&d.interface_verification_status!=='Verified'?' ('+(d.interface_verification_status||'Unknown')+')':'');}
function browseValue(d,key){if(key==='category')return d.category.name;if(key==='modules')return d.modules.length;return d[key]??'';}
function renderBrowse(){const q=$('#browseSearch').value.trim().toLowerCase(),cat=$('#browseCategory').value,layer=$('#browseLayer').value,feat=$('#browseFeature').value,ver=$('#browseVerification').value;
  let ds=visibleDevices().filter(d=>(!q||(targetVersion?searchableText(d):d.search_blob).includes(q))&&(!cat||d.category.slug===cat)&&(!layer||layerMatches(d,layer))&&(!feat||(d.feature_map[feat]&&d.feature_map[feat].support_mode!=='unsupported'))&&(!ver||d.verification_status===ver));
  ds.sort((a,b)=>{let av=browseValue(a,browseSort.key),bv=browseValue(b,browseSort.key);if(typeof av==='number'&&typeof bv==='number')return(av-bv)*browseSort.dir;return String(av).localeCompare(String(bv))*browseSort.dir;});
  $('#deviceTable').querySelectorAll('th[data-sort]').forEach(th=>th.setAttribute('aria-sort',th.dataset.sort===browseSort.key?(browseSort.dir===1?'ascending':'descending'):'none'));
  $('#browseCount').textContent=`${ds.length} device${ds.length===1?'':'s'}`;
  $('#deviceTableBody').innerHTML=ds.map(d=>`<tr><td><input type="checkbox" value="${d.device_id}" aria-label="${esc('Select '+d.display_name+' for comparison')}" ${compareIds.includes(d.device_id)?'checked':''}></td><td><strong>${esc(d.display_name)}</strong><br><span class="muted">${esc(d.pt_name)}</span></td><td>${esc(d.category.name)}</td><td>${esc(d.layer_capability)}</td><td>${!d.interfaces.length?'Not verified':d.total_physical_ports}</td><td><div class="ports">${Object.entries(d.port_totals).map(([k,v])=>`<span class="port-pill">${v}× ${esc(DB.interfaceTypes.find(i=>i.slug===k)?.name||k)}</span>`).join('')||'<span class="muted">Not verified</span>'}</div>${d.interfaces.length&&d.interface_verification_status!=='Verified'?'<small class="muted">'+esc(d.interface_verification_status||'Unknown')+' port evidence</small>':''}</td><td>${d.modules.length|| (targetVersion?'Not verified':'0')}</td><td>${availabilityBadge(d)}</td><td>${verifyBadge(d.verification_status)}</td><td><div class="catalogue-actions"><button data-device-id="${d.device_id}">Details</button>${selectionButton(d)}</div></td></tr>`).join('')||'<tr><td colspan="10" class="empty-state">No devices match these filters.</td></tr>';
}

function renderCompare(){
  $('#compareChips').innerHTML=compareIds.map(id=>`<span class="chip">${esc(deviceById[id].display_name)} <button data-remove-compare="${id}" aria-label="Remove">×</button></span>`).join('')||'<span class="muted">No devices selected.</span>';
  if(!compareIds.length){$('#compareOutput').innerHTML='<div class="panel muted">Add devices above or select rows from Browse / Search.</div>';return;}
  const ds=compareIds.map(id=>contextDevice(deviceById[id]));const featureSlugs=[...new Set(ds.flatMap(d=>Object.keys(d.feature_map)))].sort((a,b)=>(DB.featureCatalog.find(f=>f.slug===a)?.name||a).localeCompare(DB.featureCatalog.find(f=>f.slug===b)?.name||b));
  const rows=[
    ['Version availability',...ds.map(d=>availabilityText(d))],['Category',...ds.map(d=>d.category.name)],['Layer',...ds.map(d=>d.layer_capability)],['Built-in physical ports',...ds.map(d=>!d.interfaces.length?'Not verified':d.total_physical_ports)],['Ports',...ds.map(portsText)],['Modular',...ds.map(d=>d.is_modular?'Yes':'No')],['Compatible modules',...ds.map(d=>d.modules.length?d.modules.map(m=>m.model).join(', '):targetVersion?'Not verified':'—')],['Role reference',...ds.map(d=>d.roles.map(r=>r.name).join(', ')||'—')],['Record verification',...ds.map(d=>d.verification_status)]
  ];
  const featureStart=rows.length;
  featureSlugs.forEach(slug=>{const fcat=DB.featureCatalog.find(f=>f.slug===slug);rows.push([fcat?.name||slug,...ds.map(d=>featureText(d.feature_map[slug]))]);});
  const warning=ds.map(d=>contextWarning(d)).filter(Boolean);
  $('#compareOutput').innerHTML=`${warning.length?`<p class="context-note">${esc([...new Set(warning)].join(' '))}</p>`:''}<div class="table-wrap"><table class="data-table compare-table"><thead><tr><th>Attribute</th>${ds.map(d=>`<th><button data-device-id="${d.device_id}">${esc(d.display_name)}</button></th>`).join('')}</tr></thead><tbody>${rows.map((r,ri)=>`<tr><td>${esc(r[0])}</td>${r.slice(1).map(v=>`<td class="${ri>=featureStart?stateClassFromText(v):''}">${esc(v)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>${targetVersion&&!featureSlugs.length?`<p class="muted">No feature support verified for PT ${esc(targetVersion)}.x.</p>`:''}`;
}
function stateClassFromText(v){if(String(v).includes('(Partial)')||String(v).includes('(Unknown)'))return'state-unknown';if(String(v).includes('Native'))return'state-native';if(String(v).includes('Module'))return'state-module_required';if(String(v).includes('Configuration'))return'state-configuration_required';if(String(v).includes('Unsupported'))return'state-unsupported';return'state-unknown';}

function renderModuleLookups(){
  const did=Number($('#moduleDeviceSelect').value),mid=Number($('#moduleSelect').value);
  const d=deviceById[did]?contextDevice(deviceById[did]):null;$('#deviceModules').innerHTML=d?`${targetVersion?availabilityBadge(d):''}${d.modules.length?d.modules.map(m=>moduleCard(m,d.device_id)).join(''):`<p class="muted">${targetVersion?'No module compatibility verified for PT '+targetVersion+'.x.':'No compatible modules recorded.'}</p>`}`:'<p class="muted">Select a device.</p>';
  if(mid){const m=DB.modules.find(x=>x.module_id===mid);const compatible=visibleDevices().filter(d=>d.modules.some(x=>x.module_id===mid));$('#moduleDevices').innerHTML=`<p><strong>${esc(m.model)}</strong> — ${esc(m.description||'')}</p><button type="button" data-select-module="${m.module_id}"><img class="button-icon" src="assets/icons/plus.svg" alt="" aria-hidden="true"> Add part to selection</button>${compatible.length?compatible.map(d=>`<div class="module-card"><button data-device-id="${d.device_id}">${esc(d.display_name)}</button>${targetVersion?availabilityBadge(d):''}<div class="muted">${esc(d.modules.find(x=>x.module_id===mid).notes||'Compatible')} · ${esc(d.modules.find(x=>x.module_id===mid).verification_status)}</div>${selectionButton(d)}</div>`).join(''):`<p class="muted">${targetVersion?'No device compatibility verified for PT '+targetVersion+'.x.':'No compatible devices recorded.'}</p>`}`;}else $('#moduleDevices').innerHTML='<p class="muted">Select a module.</p>';
}
function moduleCard(m,deviceId){return `<div class="module-card"><h4>${esc(m.model)}</h4><div>${esc(m.description||'')}</div><div class="ports">${m.interfaces.map(i=>`<span class="port-pill">+${i.quantity}× ${esc(i.name)}</span>`).join('')}</div><div class="muted">Slot: ${esc(m.slot_name||'—')} · Max recorded: ${m.max_quantity??'—'} · ${esc(m.verification_status)}</div>${m.notes?`<div class="muted">${esc(m.notes)}</div>`:''}<button type="button" data-select-module="${m.module_id}"${deviceId?` data-for-device-id="${deviceId}"`:''}><img class="button-icon" src="assets/icons/plus.svg" alt="" aria-hidden="true"> Add part to selection</button></div>`;}

function interfaceCandidates(d,allowModules){const out=d.interfaces.map(i=>({...i,via:'built-in'}));if(allowModules){d.modules.forEach(m=>m.interfaces.forEach(i=>out.push({...i,via:`module ${m.model}`,module:m.model})));}return out;}
function isCopperEth(i){return ['ethernet10','fastethernet','gigabitethernet','tengigabit','management_ge'].includes(i.slug);}
function findCategoryCable(a,b){const pa=[a.category.slug,b.category.slug];let rule=DB.connectionRules.find(r=>r.category_a_slug===pa[0]&&r.category_b_slug===pa[1]);if(!rule)rule=DB.connectionRules.find(r=>r.category_a_slug===pa[1]&&r.category_b_slug===pa[0]);return rule;}
function renderConnections(){const rawA=deviceById[Number($('#connDeviceA').value)],rawB=deviceById[Number($('#connDeviceB').value)],allow=$('#connAllowModules').checked;if(!rawA||!rawB){$('#connectionOutput').innerHTML='<div class="panel muted">Select two devices.</div>';return;}const a=contextDevice(rawA),b=contextDevice(rawB),ai=interfaceCandidates(a,allow),bi=interfaceCandidates(b,allow);const opts=[];
  const ac=ai.filter(isCopperEth).sort((x,y)=>(y.speed_mbps||0)-(x.speed_mbps||0))[0],bc=bi.filter(isCopperEth).sort((x,y)=>(y.speed_mbps||0)-(x.speed_mbps||0))[0];if(ac&&bc){const rule=findCategoryCable(a,b);opts.push({title:'Copper Ethernet',cable:rule?.cable_name||'Copper cable / Automatic',speed:Math.min(ac.speed_mbps||Infinity,bc.speed_mbps||Infinity),a:ac,b:bc,note:rule?.notes||'Use Packet Tracer Automatic Connection if unsure; Auto-MDIX support varies by simulated device.'});}
  const af=ai.find(i=>i.slug==='gigabit_sfp'),bf=bi.find(i=>i.slug==='gigabit_sfp');if(af&&bf)opts.push({title:'Fiber/SFP',cable:'Fiber',speed:1000,a:af,b:bf,note:'Use compatible optical transceivers/fiber at both ends.'});
  const as=ai.find(i=>i.slug==='serial'),bs=bi.find(i=>i.slug==='serial');if(as&&bs)opts.push({title:'Serial WAN',cable:'Serial DCE/DTE',speed:null,a:as,b:bs,note:'One end must be DCE and provide clocking where Packet Tracer requires it.'});
  const warning=[contextWarning(a),contextWarning(b)].filter(Boolean);
  $('#connectionOutput').innerHTML=`<div class="panel"><h3>${esc(a.display_name)} ↔ ${esc(b.display_name)}</h3>${warning.length?`<p class="context-note">${esc([...new Set(warning)].join(' '))}</p>`:''}${opts.length?opts.map(o=>`<div class="connection-card"><h4>${esc(o.title)} — ${esc(o.cable)}</h4><div class="kv"><dt>${esc(a.display_name)}</dt><dd>${esc(o.a.name)} (${esc(o.a.via)})</dd><dt>${esc(b.display_name)}</dt><dd>${esc(o.b.name)} (${esc(o.b.via)})</dd>${o.speed&&Number.isFinite(o.speed)?`<dt>Link ceiling</dt><dd>${o.speed>=1000?(o.speed/1000)+' Gb/s':o.speed+' Mb/s'} based on the slower selected interface</dd>`:''}<dt>Note</dt><dd>${esc(o.note)}</dd></div></div>`).join(''):`<p class="muted">${targetVersion&&!ai.length||targetVersion&&!bi.length?'No interface data verified for both devices in PT '+targetVersion+'.x.':'No compatible connection is recorded from the available built-in/module interfaces.'} Verify the Physical tab in your Packet Tracer version.</p>`}</div>`;
}

function renderSources(){$('#sourcesBody').innerHTML=DB.sources.map(s=>`<tr><td><span class="source-tier tier-${s.source_tier}">Tier ${s.source_tier}</span></td><td>${esc(s.publisher)}</td><td>${esc(s.title)}</td><td>${esc(s.source_type)}</td><td>${esc(s.publication_date||'—')}</td><td><a href="${esc(s.url)}" target="_blank" rel="noopener">Open source</a></td></tr>`).join('');}

function sourceLink(url,title,publisher){return url?`<a href="${esc(url)}" title="${esc(title)}" target="_blank" rel="noopener">${esc(publisher||title||'Source')}</a>`:'—';}
function openDevice(id){const raw=deviceById[id];if(!raw)return;
  if(activeModalId===null){modalReturnFocus=document.activeElement;modalBodyOverflow=document.body.style.overflow;modalBackgroundState=$$('.app-header, .tabs, main, footer').map(element=>[element,element.inert]);modalBackgroundState.forEach(([element])=>{element.inert=true;});}
  activeModalId=id;const d=contextDevice(raw),featGroups={};d.features.forEach(f=>(featGroups[f.category_name]??=[]).push(f));
  $('#modalContent').innerHTML=`<div class="detail-header"><div class="eyebrow">${esc(d.category.name)}</div><h2 id="modalTitle">${esc(d.display_name)}</h2><p>${esc(d.description||'')}</p><div class="chips"><span class="chip">PT name: ${esc(d.pt_name)}</span><span class="chip">Layer: ${esc(d.layer_capability)}</span><span class="chip">${d.is_modular?'Modular':'Fixed'}</span>${availabilityBadge(d)}${verifyBadge(d.verification_status)}</div>${contextWarning(d)?`<p class="context-note">${esc(contextWarning(d))}</p>`:''}<div class="card-actions">${selectionButton(d)}</div></div>
  <section class="detail-section"><h3>Version availability</h3><div class="table-wrap"><table class="data-table"><thead><tr><th>Version</th><th>Availability</th><th>Evidence</th></tr></thead><tbody>${majorVersions.map(v=>{const a=availability(raw,v);return `<tr><td>${v}.x</td><td>${availabilityCell(raw,v)}</td><td>${esc(a.notes)}<small class="muted">${esc(a.evidence_kind||'unverified')} · checked ${esc(a.checked_date||'Not recorded')}</small></td></tr>`;}).join('')}</tbody></table></div></section>
  <div class="detail-grid"><section class="detail-section"><h3>${targetVersion?'General model reference':'Build use'}</h3><div class="kv"><dt>Typical use</dt><dd>${esc(d.typical_use||'—')}</dd><dt>Role reference</dt><dd>${esc(d.roles.map(r=>r.name).join(', ')||'—')}</dd><dt>PT coverage</dt><dd>${esc(availabilityText(raw,''))}</dd></div></section>
  <section class="detail-section"><h3>Built-in interfaces</h3>${verifyBadge(d.interface_verification_status)}${d.interfaces.length?`<div class="ports">${d.interfaces.map(i=>`<span class="port-pill">${i.quantity}× ${esc(i.name)}${i.name_pattern?` · ${esc(i.name_pattern)}`:''}</span>`).join('')}</div>`:'<p class="muted">No interface data verified for this version.</p>'}</section></div>
  <section class="detail-section"><h3>Features</h3>${Object.entries(featGroups).map(([g,fs])=>`<h4>${esc(g)}</h4><div class="ports">${fs.map(f=>`<span class="port-pill feature-state state-${f.verification_status!=='Verified'?'unknown':f.support_mode}" title="${esc(f.notes||'')}">${esc(featureText(f))} ${esc(f.name)}</span>`).join('')}</div>`).join('')||'<p class="muted">No feature support verified for this version.</p>'}</section>
  <section class="detail-section"><h3>Expansion modules</h3>${d.modules.length?d.modules.map(m=>moduleCard(m,d.device_id)).join(''):'<p class="muted">No module compatibility verified for this version.</p>'}</section>
  ${d.limitations.length?`<section class="detail-section"><h3>Packet Tracer notes / limitations</h3>${d.limitations.map(l=>`<div class="limitation"><strong>${esc(l.title)}</strong><div>${esc(l.description)}</div><div class="muted">${sourceLink(l.source_url,l.source_title,l.source_publisher)}</div></div>`).join('')}</section>`:''}
  <section class="detail-section"><h3>Evidence</h3><div class="muted">Interface and feature records include individual evidence links. For build-critical decisions, verify the device Physical/CLI tabs in your installed Packet Tracer version when the record is marked Partial.</div>${uniqueDeviceSources(d).map(s=>`<div>Tier ${s.tier}: ${sourceLink(s.url,s.title,s.publisher)}</div>`).join('')}</section>`;
  $('#modal').classList.remove('hidden');document.body.style.overflow='hidden';$('#modalCloseBtn').focus();
}
function uniqueDeviceSources(d){const seen=new Map();const add=(url,title,publisher,tier)=>{if(url&&!seen.has(url))seen.set(url,{url,title,publisher,tier:tier||4});};d.versions.forEach(x=>add(x.source_url,x.source_title,x.source_publisher,x.source_tier));d.interfaces.forEach(x=>add(x.source_url,x.source_title,x.source_publisher,x.source_tier));d.features.forEach(x=>add(x.source_url,x.source_title,x.source_publisher,x.source_tier));d.modules.forEach(x=>add(x.source_url,x.source_title,x.source_publisher,x.source_tier));d.limitations.forEach(x=>add(x.source_url,x.source_title,x.source_publisher,x.source_tier));return [...seen.values()].sort((a,b)=>a.tier-b.tier);}
function handleModalKeydown(e){
  if(activeModalId===null)return;
  if(e.key==='Escape'){e.preventDefault();closeModal();return;}
  if(e.key!=='Tab')return;
  const focusable=Array.from($('#modal').querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')).filter(element=>element.getClientRects().length);
  const first=focusable[0]||$('#modal'),last=focusable[focusable.length-1]||first;
  if(!focusable.includes(document.activeElement)){e.preventDefault();(e.shiftKey?last:first).focus();}
  else if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}
  else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}
}
function closeModal(){
  if(activeModalId===null)return;
  activeModalId=null;$('#modal').classList.add('hidden');document.body.style.overflow=modalBodyOverflow;
  modalBackgroundState.forEach(([element,inert])=>{element.inert=inert;});modalBackgroundState=[];
  const restore=modalReturnFocus?.isConnected?modalReturnFocus:$('#versionFilter');modalReturnFocus=null;restore.focus();
}

// Add compare buttons through delegation without inline application logic.
document.addEventListener('click',e=>{const b=e.target.closest('[data-add-compare]');if(b){const id=Number(b.dataset.addCompare);if(!compareIds.includes(id)&&compareIds.length<4)compareIds.push(id);renderCompare();renderBrowse();}});

init();
})();
