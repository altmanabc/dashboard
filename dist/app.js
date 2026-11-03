import {RACE_CONFIG,validateFeed,waitingRace,allRaces,margin,sortedCandidates,createDemo} from './data.js';
const $=s=>document.querySelector(s);const $$=s=>[...document.querySelectorAll(s)];
const escape=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const icons=name=>'<svg class="icon"><use href="#i-'+name+'"/></svg>';
const storage={get(key,fallback){try{return JSON.parse(localStorage.getItem(key))??fallback;}catch{return fallback;}},set(key,value){try{localStorage.setItem(key,JSON.stringify(value));}catch{}}};
const validIds=new Set(RACE_CONFIG.map(r=>r.id));
const saved=storage.get('abc-watchlist',[]);
const state={tab:'all',query:'',status:'all',sort:'priority',compact:storage.get('abc-compact',false)===true,watchlist:new Set(Array.isArray(saved)?saved.filter(id=>validIds.has(id)):[]),feed:null,mode:'waiting',feedUrl:typeof storage.get('abc-feed-url','')==='string'?storage.get('abc-feed-url',''):'',error:'',lastChecked:null,pending:false,generation:0,controller:null,detailId:null};
let toastTimer;let timer;
const partyLabel=p=>({DEM:'Democratic',REP:'Republican',IND:'Independent',OTHER:'Other'}[p]||'Other');
const partyClass=p=>p==='DEM'?'dem-bg':p==='REP'?'rep-bg':'other-bg';
const partyText=p=>p==='DEM'?'dem-text':p==='REP'?'rep-text':'';
const fmt=n=>n===null||n===undefined?'—':new Intl.NumberFormat('en-US').format(n);
const time=value=>value?new Intl.DateTimeFormat('en-US',{hour:'numeric',minute:'2-digit',timeZone:'America/New_York'}).format(new Date(value))+' ET':'—';
const fullTime=value=>value?new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit',timeZone:'America/New_York'}).format(new Date(value))+' ET':'No results supplied';
const age=value=>value?Math.max(0,Date.now()-Date.parse(value)):Infinity;
function toast(message){$('#toast').textContent=message;$('#toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').hidden=true,3800);}
function stale(){return state.mode!=='demo'&&state.feed&&age(state.feed.updatedAt)>120000;}
function renderStatus(){
 let pill='AWAITING FEED',nav='Feed ready',copy='Ready for live results. No results feed connected.',kind='',dot='';
 if(state.mode==='demo'){pill='DEMO DATA';nav='Demo mode';copy='Fictional results · Preview only';kind='is-demo';}
 else if(state.error){pill=state.feed?'UPDATE FAILED':'CONNECTION ERROR';nav='Feed error';copy=state.feed?'Refresh failed. Showing the last successful results.':'Unable to load results. Open Data connection to check the feed.';kind='is-error';dot='error';}
 else if(stale()){pill='STALE DATA';nav='Feed delayed';copy='No fresh data for over 2 minutes · '+state.feed.source.name;kind='is-error';dot='error';}
 else if(state.feed){pill='LIVE RESULTS';nav='Live updates';copy='Results: '+state.feed.source.name;kind='is-live';dot='live';}
 else if(state.pending){pill='CONNECTING';nav='Connecting';copy='Requesting the latest results…';}
 $('#mode-pill').textContent=pill;$('#mode-pill').className='status-pill '+kind;$('#nav-status').textContent=nav;$('#nav-dot').className='status-dot '+dot;$('#status-copy').textContent=copy;
 $('#last-updated').textContent=state.feed?'Updated '+time(state.feed.updatedAt):'Updates every 30s';$('#last-updated').title=state.feed?fullTime(state.feed.updatedAt):'Automatic refresh every 30 seconds when a feed is connected';
 $('#demo-notice').hidden=state.mode!=='demo';$('#quick-demo').hidden=state.mode==='demo'||!!state.feed;$('#quick-connect').hidden=!!state.feed;$('#refresh').disabled=state.pending;$('#refresh .icon').classList.toggle('spin',state.pending);
}
function renderChambers(){
 $('#chambers').innerHTML=['senate','house'].map(ch=>{
  const c=state.feed?.chambers[ch];const total=ch==='senate'?100:435;const threshold=ch==='senate'?51:218;const name=ch==='senate'?'U.S. Senate':'U.S. House';
  const call=c?.control;const banner=call?partyLabel(call)+' CONTROL':'CONTROL UNCALLED';
  const seatSpan=(n,cl)=>'<span class="'+cl+'" style="width:'+(100*n/total)+'%"></span>';
  return '<article class="chamber-card"><div class="chamber-top"><h3>'+name+'</h3><span class="'+(call?'called-badge':'uncalled-badge')+'">'+banner+'</span></div><div class="chamber-counts"><div class="party-total"><strong class="party-number dem-text">'+fmt(c?.dem)+'</strong><span class="party-label">DEMOCRATS</span></div><div class="majority-label"><b>'+threshold+' seats</b>for '+(ch==='senate'?'outright majority':'a majority')+'</div><div class="party-total right"><strong class="party-number rep-text">'+fmt(c?.rep)+'</strong><span class="party-label">REPUBLICANS</span></div></div><div class="seat-bar" role="img" aria-label="'+(c?escape(name+': '+c.dem+' Democrats, '+c.rep+' Republicans, '+c.other+' other, '+c.uncalled+' uncalled'):'Awaiting '+name+' seat counts')+'">'+(c?seatSpan(c.dem,'dem-bg')+seatSpan(c.other,'other-bg')+seatSpan(c.uncalled,'unknown-bg')+seatSpan(c.rep,'rep-bg'):'')+'<i class="threshold-line" style="left:'+((threshold-.5)/total*100)+'%"></i></div><div class="chamber-foot"><span><i class="mini-dot"></i>'+ (c?fmt(c.uncalled)+' uncalled'+(c.other?' · '+fmt(c.other)+' other':''):'Awaiting chamber feed')+'</span><span>'+total+' total seats'+(ch==='senate'?' · 50 + VP tie-break':'')+'</span></div></article>';
 }).join('');
 const calls=['senate','house'].filter(ch=>state.feed?.chambers[ch]?.control);
 $('#control-status').textContent=calls.length?calls.length+' chamber'+(calls.length>1?'s':'')+' called by source':'Control has not been called';
}
function candidateHtml(c,r,details=false){
 const percent=r.totalVotes===null?null:r.totalVotes===0?0:100*c.votes/r.totalVotes;
 const name=r.status==='waiting'?'Awaiting candidate':c.name;
 return '<div class="candidate"><span class="party-stripe '+partyClass(c.party)+'"></span><span class="candidate-name" title="'+escape(name)+'">'+escape(name)+(r.calledWinnerId===c.id?'<span class="winner-check" aria-label="Projected winner">✓</span>':'')+'<small class="candidate-party">'+partyLabel(c.party)+'</small></span><span class="candidate-result">'+(percent===null?'—':percent.toFixed(1)+'%')+'<small>'+ (c.votes===null?'Votes pending':fmt(c.votes)+' votes')+'</small></span></div>';
}
function cardHtml(r){
 const m=margin(r);const isClose=r.status==='uncalled'&&m!==null&&m<2;const isCalled=r.status==='called';const selected=state.watchlist.has(r.id);const isStale=stale();
 let status=r.status==='waiting'?'Awaiting results':isCalled?'✓ Projected winner':isClose?'Close race':'Race uncalled';if(isStale)status+=' · Delayed';
 const candidates=sortedCandidates(r);const shown=candidates.length?candidates.slice(0,2):waitingRace(r).candidates;const winner=candidates.find(c=>c.id===r.calledWinnerId);if(winner&&!shown.some(c=>c.id===winner.id)){shown[shown.length-1]=winner;}const voteIn=r.estimatedVoteIn===null?'Vote in: —':r.estimatedVoteIn.toFixed(r.estimatedVoteIn%1?1:0)+'% vote in';
 return '<article class="race-card '+(isCalled?'called':'')+'" data-race-id="'+r.id+'"><div class="card-header"><div><div class="race-code">'+r.abbr+' · '+(r.chamber==='senate'?'SENATE':'DISTRICT '+r.district)+'</div><h3 class="race-name"><button data-detail="'+r.id+'">'+escape(r.state)+(r.chamber==='house'?' <span>'+r.district+'</span>':'')+'</button></h3></div><button class="star-button '+(selected?'selected':'')+'" data-star="'+r.id+'" aria-label="'+(selected?'Remove ':'Add ')+escape(r.shortName)+(selected?' from':' to')+' watchlist" aria-pressed="'+selected+'">'+icons('star')+'</button></div><div class="card-status '+(isCalled?'is-called':isClose?'is-close':'')+'">'+(!isCalled?'<span class="status-dot"></span>':'')+escape(status)+'</div><div class="candidates">'+(shown.length?shown.map(c=>candidateHtml(c,r)).join(''):'<p class="subtle">Candidates awaiting source data.</p>')+'</div><div class="vote-bar" aria-hidden="true">'+(r.totalVotes?candidates.map(c=>'<span class="'+partyClass(c.party)+'" style="width:'+(100*c.votes/r.totalVotes)+'%"></span>').join(''):'')+'</div><div class="card-footer"><span><b>'+voteIn+'</b>'+ (candidates.length>2?' · +'+(candidates.length-2)+' more':'')+'</span><button class="details-link" data-detail="'+r.id+'" aria-label="View '+escape(r.shortName)+' race details">Details '+icons('arrow')+'</button></div></article>';
}
function filteredRaces(){
 let list=allRaces(state.feed);if(state.tab==='watchlist')list=list.filter(r=>state.watchlist.has(r.id));else if(state.tab!=='all')list=list.filter(r=>r.chamber===state.tab);
 const q=state.query.toLowerCase().trim();if(q)list=list.filter(r=>[r.id,r.state,r.abbr,r.chamber,r.shortName,...r.candidates.map(c=>c.name)].some(v=>v.toLowerCase().includes(q)));
 if(state.status==='called')list=list.filter(r=>r.status==='called');
 if(state.status==='uncalled')list=list.filter(r=>r.status!=='called');
 if(state.status==='close')list=list.filter(r=>r.status==='uncalled'&&margin(r)!==null&&margin(r)<2);
 list.sort((a,b)=>state.sort==='alphabetical'?a.name.localeCompare(b.name):state.sort==='closest'?(margin(a)??Infinity)-(margin(b)??Infinity)||a.priority-b.priority:state.sort==='reporting'?(b.estimatedVoteIn??-1)-(a.estimatedVoteIn??-1)||a.priority-b.priority:a.priority-b.priority);
 return list;
}
function renderRaces(){
 const list=filteredRaces();$('#race-grid').innerHTML=list.map(cardHtml).join('');$('#race-grid').classList.toggle('compact',state.compact);$('#result-count').textContent=list.length;
 const titles={all:'Races to watch',senate:'Senate races',house:'House races',watchlist:'My watchlist'};$('#races-title').firstChild.textContent=titles[state.tab]+' ';
 $('#race-summary-text').textContent=state.query||state.status!=='all'?list.length+' matching race'+(list.length!==1?'s':''):state.tab==='all'?'13 Senate races · 8 House races':list.length+' '+(state.tab==='watchlist'?'saved':'priority')+' race'+(list.length!==1?'s':'');
 $('#watch-count').textContent=state.watchlist.size;$('#empty-state').hidden=!!list.length;
 const emptyWatch=state.tab==='watchlist'&&!state.watchlist.size;
 $('#empty-title').textContent=emptyWatch?'Your watchlist starts here':'No matching races';$('#empty-copy').textContent=emptyWatch?'Star any race to keep it in your personal election-night view.':'Try another search or clear your filters.';$('#clear-filters').textContent=emptyWatch?'Explore all races':'Clear filters';
 $$('#main-tabs .tab').forEach(b=>{const active=b.dataset.tab===state.tab;b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active));});
 $('#grid-view').classList.toggle('active',!state.compact);$('#grid-view').setAttribute('aria-pressed',String(!state.compact));$('#list-view').classList.toggle('active',state.compact);$('#list-view').setAttribute('aria-pressed',String(state.compact));
}
function renderCalls(){
 const calls=allRaces(state.feed).filter(r=>r.status==='called').sort((a,b)=>Date.parse(b.calledAt)-Date.parse(a.calledAt));$('#calls-counter').textContent=calls.length;
 $('#calls-list').innerHTML=calls.length?calls.slice(0,5).map(r=>{const w=r.candidates.find(c=>c.id===r.calledWinnerId);return '<button class="call-item" data-detail="'+r.id+'"><div class="call-meta"><span>'+escape(r.shortName)+'</span><time datetime="'+escape(r.calledAt)+'">'+time(r.calledAt)+'</time></div><div class="call-winner"><span class="call-party '+partyClass(w.party)+'"></span>'+escape(w.name)+' <span class="winner-check">✓</span></div><div class="call-description">'+escape(r.callSource)+' projects '+partyLabel(w.party)+' win</div></button>';}).join(''):'<div class="calls-empty"><div class="call-empty-icon">✓</div><h3>No race calls yet</h3><p>When the connected source projects a winner, the call will appear here.</p></div>';
}
function render(){renderStatus();renderChambers();renderRaces();renderCalls();if(state.detailId&&$('#race-dialog').open)renderDetail();}
function setTab(tab,scroll=false){state.tab=tab;renderRaces();if(scroll)$('#races').scrollIntoView({behavior:'smooth',block:'start'});}
function showFeed(){const d=$('#feed-dialog');$('#feed-url').value=state.feedUrl;$('#feed-error').hidden=true;$('#disconnect-feed').disabled=!state.feedUrl;if(!d.open)d.showModal();}
function validateUrl(raw){let u;try{u=new URL(raw);}catch{throw new Error('Enter a valid HTTPS feed URL.');}if(u.protocol!=='https:'||u.username||u.password)throw new Error('Use an HTTPS feed URL without embedded credentials.');return u.href;}
async function requestFeed(url,signal){
 const res=await fetch(url,{signal,cache:'no-store',credentials:'omit',headers:{Accept:'application/json'}});
 if(!res.ok)throw new Error('The feed returned HTTP '+res.status+'.');
 const length=Number(res.headers.get('Content-Length'));if(length>3000000)throw new Error('The feed is larger than 3 MB.');
 const body=await res.text();if(body.length>3000000)throw new Error('The feed is larger than 3 MB.');
 let data;try{data=JSON.parse(body);}catch{throw new Error('The URL did not return valid JSON.');}return validateFeed(data);
}
function cancelRequest(){state.generation++;state.controller?.abort();state.controller=null;state.pending=false;}
async function refresh(manual=false){
 if(state.pending)return;
 if(state.mode==='demo'){if(manual)toast('Demo results are fictional. Connect a feed for live updates.');renderStatus();return;}
 if(!state.feedUrl){if(manual)showFeed();return;}
 state.pending=true;const controller=new AbortController();state.controller=controller;const generation=++state.generation;const timeout=setTimeout(()=>controller.abort(),15000);renderStatus();
 try{const incoming=await requestFeed(state.feedUrl,controller.signal);if(generation!==state.generation)return;
  if(state.feed&&Date.parse(incoming.updatedAt)<Date.parse(state.feed.updatedAt))throw new Error('The feed returned an older snapshot. Keeping the latest results.');
  const oldCalls=new Set(state.feed?.races.filter(r=>r.status==='called').map(r=>r.id)||[]);const newCalls=incoming.races.filter(r=>r.status==='called'&&!oldCalls.has(r.id));
  state.feed=incoming;state.mode='live';state.error='';state.lastChecked=Date.now();
  if(newCalls.length){$('#live-announcement').textContent=newCalls.length+' new race call'+(newCalls.length>1?'s':'')+' from '+incoming.source.name+'.';if(oldCalls.size)toast(newCalls.length+' new race call'+(newCalls.length>1?'s':'')+' from '+incoming.source.name);}
  if(manual)toast('Results refreshed · '+time(incoming.updatedAt));
 }catch(e){if(generation!==state.generation)return;state.error=e.name==='AbortError'?'The feed timed out after 15 seconds.':'Unable to refresh: '+e.message;if(manual)toast(state.error);}
 finally{clearTimeout(timeout);if(generation===state.generation){state.pending=false;state.controller=null;render();}}
}
async function connect(event){
 event.preventDefault();$('#feed-error').hidden=true;let url;try{url=validateUrl($('#feed-url').value.trim());}catch(e){$('#feed-error').textContent=e.message;$('#feed-error').hidden=false;return;}
 cancelRequest();const generation=state.generation;const controller=new AbortController();state.controller=controller;state.pending=true;const timeout=setTimeout(()=>controller.abort(),15000);$('#connect-feed').disabled=true;$('#connect-feed').textContent='Connecting…';renderStatus();
 try{const feed=await requestFeed(url,controller.signal);if(generation!==state.generation)return;state.feedUrl=url;state.feed=feed;state.error='';state.mode='live';state.lastChecked=Date.now();storage.set('abc-feed-url',url);$('#feed-dialog').close();toast('Results feed connected. Refreshing every 30 seconds.');}
 catch(e){if(generation!==state.generation)return;$('#feed-error').textContent=e.name==='AbortError'?'The feed timed out. Check the URL and its CORS settings.':e.message+' Check the feed URL, format, and CORS settings.';$('#feed-error').hidden=false;}
 finally{clearTimeout(timeout);if(generation===state.generation){state.pending=false;state.controller=null;}$('#connect-feed').disabled=false;$('#connect-feed').textContent='Connect feed';render();}
}
function disconnect(){cancelRequest();state.feedUrl='';state.feed=null;state.mode='waiting';state.error='';storage.set('abc-feed-url','');$('#feed-dialog').close();render();toast('Results feed disconnected.');}
function demo(){cancelRequest();state.mode='demo';state.feed=createDemo();state.error='';$('#feed-dialog').close();render();toast('Demo mode · All results and candidates are fictional.');}
function exitDemo(){cancelRequest();state.mode='waiting';state.feed=null;state.error='';render();if(state.feedUrl)refresh();else toast('Demo closed. Connect your feed for live results.');}
function renderDetail(){
 const r=allRaces(state.feed).find(r=>r.id===state.detailId);if(!r)return;const w=r.candidates.find(c=>c.id===r.calledWinnerId);const m=margin(r);const selected=state.watchlist.has(r.id);
 $('#race-detail').innerHTML='<div class="dialog-top"><span class="section-kicker">'+(state.mode==='demo'?'FICTIONAL DEMO · ':'')+escape(r.shortName)+'</span><button class="icon-button close-dialog" aria-label="Close race details">✕</button></div><h2 id="race-detail-title">'+escape(r.name)+' · '+(r.chamber==='senate'?'Senate':'House')+'</h2><p class="detail-metadata">'+(r.status==='called'?'✓ '+escape(r.callSource)+' projects '+escape(w.name)+' wins':r.status==='waiting'?'Awaiting results feed':'Race uncalled')+'</p><div class="detail-candidates">'+sortedCandidates(r).map(c=>candidateHtml(c,r,true)).join('')+'</div><div class="detail-stats"><div><b>'+fmt(r.totalVotes)+'</b>Total votes</div><div><b>'+(r.estimatedVoteIn===null?'—':r.estimatedVoteIn+'%')+'</b>Estimated vote in</div><div><b>'+(m===null?'—':m.toFixed(2)+' pts')+'</b>Current margin</div></div><p class="detail-note">'+(state.mode==='demo'?'Fictional demo data. These candidates and results are illustrative.':r.status==='waiting'?'Candidate names and vote counts will appear when supplied by your feed.':'Source: '+escape(state.feed.source.name)+'. Results updated '+fullTime(r.updatedAt)+'.'+(r.status==='called'?' Call: '+fullTime(r.calledAt)+'.':' A lead is not a race call.'))+'</p><button class="button-secondary" data-star="'+r.id+'">'+icons('star')+(selected?'Remove from watchlist':'Add to watchlist')+'</button>';
}
function detail(id){state.detailId=id;renderDetail();if(!$('#race-dialog').open)$('#race-dialog').showModal();}
$('#quick-connect').addEventListener('click',showFeed);$('#quick-demo').addEventListener('click',demo);$('#data-button').addEventListener('click',showFeed);$('#footer-source').addEventListener('click',showFeed);$('#feed-form').addEventListener('submit',connect);$('#disconnect-feed').addEventListener('click',disconnect);$('#start-demo').addEventListener('click',demo);$('#exit-demo').addEventListener('click',exitDemo);$('#refresh').addEventListener('click',()=>refresh(true));
$('#main-tabs').addEventListener('click',e=>{const b=e.target.closest('[data-tab]');if(b)setTab(b.dataset.tab);});
$('#search').addEventListener('input',e=>{state.query=e.target.value;renderRaces();});$('#status-filter').addEventListener('change',e=>{state.status=e.target.value;renderRaces();});$('#sort').addEventListener('change',e=>{state.sort=e.target.value;renderRaces();});
$('#grid-view').addEventListener('click',()=>{state.compact=false;storage.set('abc-compact',false);renderRaces();});$('#list-view').addEventListener('click',()=>{state.compact=true;storage.set('abc-compact',true);renderRaces();});
$('#open-watchlist').addEventListener('click',()=>setTab('watchlist',true));$('#all-calls').addEventListener('click',()=>{state.tab='all';state.query='';state.status='called';$('#search').value='';$('#status-filter').value='called';setTab('all',true);});
$('#clear-filters').addEventListener('click',()=>{state.query='';state.status='all';$('#search').value='';$('#status-filter').value='all';if(state.tab==='watchlist'&&!state.watchlist.size)state.tab='all';renderRaces();});
$('#methodology').addEventListener('click',()=>$('#info-dialog').showModal());
$('#race-dialog').addEventListener('close',()=>state.detailId=null);
$$('dialog').forEach(d=>d.addEventListener('click',e=>{if(e.target===d){const r=d.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)d.close();}}));
document.addEventListener('click',e=>{
 const closer=e.target.closest('.close-dialog');if(closer){closer.closest('dialog').close();return;}
 const star=e.target.closest('[data-star]');if(star){const id=star.dataset.star;if(state.watchlist.has(id)){state.watchlist.delete(id);toast('Race removed from your watchlist.');}else{state.watchlist.add(id);toast('Race added to your watchlist.');}storage.set('abc-watchlist',[...state.watchlist]);renderRaces();if($('#race-dialog').open)renderDetail();return;}
 const d=e.target.closest('[data-detail]');if(d)detail(d.dataset.detail);
});
$('#schema-example').textContent=JSON.stringify({schemaVersion:1,electionDate:'2026-11-03',source:{name:'Your authorized results provider'},updatedAt:'2026-11-03T18:00:00Z',chambers:{senate:{dem:0,rep:0,other:0,uncalled:100,control:null},house:{dem:0,rep:0,other:0,uncalled:435,control:null}},races:[{id:'AK-sen',updatedAt:'2026-11-03T18:00:00Z',estimatedVoteIn:null,status:'uncalled',candidates:[{id:'candidate-a',name:'Provider candidate name',party:'DEM',votes:null}],calledWinnerId:null}]},null,2);
render();if(state.feedUrl){try{state.feedUrl=validateUrl(state.feedUrl);refresh();}catch{state.feedUrl='';storage.set('abc-feed-url','');}}
function startTimer(){clearInterval(timer);timer=setInterval(()=>{if(!document.hidden)refresh();renderStatus();},30000);}startTimer();
window.addEventListener('pageshow',e=>{if(e.persisted){startTimer();refresh();}});
document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();});
window.addEventListener('pagehide',()=>{clearInterval(timer);cancelRequest();});
