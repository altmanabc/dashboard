export const ELECTION_DATE = '2026-11-03';
export const RACE_CONFIG = [
 ['AK-sen','Alaska','AK','senate'],['IA-sen','Iowa','IA','senate'],['KS-sen','Kansas','KS','senate'],['ME-sen','Maine','ME','senate'],['OH-sen','Ohio','OH','senate'],['TX-sen','Texas','TX','senate'],['GA-sen','Georgia','GA','senate'],['NC-sen','North Carolina','NC','senate'],['MI-sen','Michigan','MI','senate'],['MN-sen','Minnesota','MN','senate'],['MS-sen','Mississippi','MS','senate'],['NH-sen','New Hampshire','NH','senate'],['SC-sen','South Carolina','SC','senate'],
 ['PA-07','Pennsylvania','PA','house','07'],['PA-01','Pennsylvania','PA','house','01'],['NC-01','North Carolina','NC','house','01'],['OH-07','Ohio','OH','house','07'],['AZ-06','Arizona','AZ','house','06'],['MI-07','Michigan','MI','house','07'],['NY-17','New York','NY','house','17'],['TX-15','Texas','TX','house','15']
].map(([id,state,abbr,chamber,district],priority)=>({id,state,abbr,chamber,district,priority,name:chamber==='senate'?state:state+' '+district,shortName:chamber==='senate'?abbr+' Senate':abbr+'-'+district}));
const DATE_LIMIT=5*60*1000;
function fail(message){throw new Error(message);}
function isObject(v){return v && typeof v==='object' && !Array.isArray(v);}
function timestamp(v,label,now){if(typeof v!=='string'||!/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(v)||!Number.isFinite(Date.parse(v)))fail(label+' must be an ISO 8601 timestamp with a timezone.');if(Date.parse(v)>now+DATE_LIMIT)fail(label+' is in the future.');return v;}
function shortString(v,label,max=150){if(typeof v!=='string'||!v.trim()||v.length>max)fail(label+' must be a nonempty string.');return v.trim();}
function count(v,label){if(!Number.isSafeInteger(v)||v<0)fail(label+' must be a nonnegative integer.');return v;}
export function validateFeed(input, now=Date.now()){
 if(!isObject(input))fail('The feed must be a JSON object.');
 if(input.schemaVersion!==1)fail('Expected schemaVersion: 1. Download the example JSON for the feed format.');
 if(input.electionDate!==ELECTION_DATE)fail('This dashboard expects electionDate: '+ELECTION_DATE+'.');
 if(!isObject(input.source))fail('The feed must identify its source.');
 const source={name:shortString(input.source.name,'Source name',100)};
 if(input.source.url){try{const u=new URL(input.source.url);if(u.protocol!=='https:'||u.username||u.password)fail('Invalid source URL.');source.url=u.href;}catch{fail('Source URL must be a public HTTPS URL.');}}
 const updatedAt=timestamp(input.updatedAt,'Feed updatedAt',now);
 if(!Array.isArray(input.races))fail('The feed must contain a races array.');
 if(input.races.length>1000)fail('The feed contains too many races.');
 const seen=new Set(); const races=[];
 for(const r of input.races){
  if(!isObject(r))fail('Each race must be an object.');
  if(typeof r.id!=='string')fail('Each race needs an id.');
  if(seen.has(r.id))fail('Duplicate race: '+r.id);seen.add(r.id);
  const config=RACE_CONFIG.find(c=>c.id===r.id);if(!config)continue;
  const raceTime=timestamp(r.updatedAt,'Race '+r.id+' updatedAt',now);
  if(!Array.isArray(r.candidates)||r.candidates.length>30)fail(r.id+': candidates must be an array of at most 30 candidates.');
  const candidateIds=new Set();
  const candidates=r.candidates.map(c=>{
   if(!isObject(c))fail(r.id+': invalid candidate.');
   const id=shortString(c.id,'Candidate id',80);if(candidateIds.has(id))fail(r.id+': duplicate candidate id.');candidateIds.add(id);
   const name=shortString(c.name,'Candidate name',100);
   if(!['DEM','REP','IND','OTHER'].includes(c.party))fail(r.id+': party must be DEM, REP, IND, or OTHER.');
   return {id,name,party:c.party,votes:c.votes===null?null:count(c.votes,r.id+' candidate votes')};
  });
  const hasVotes=candidates.some(c=>c.votes!==null);
  if(hasVotes&&candidates.some(c=>c.votes===null))fail(r.id+': supply counts for all candidates or null for all candidates.');
  const total=candidates.reduce((n,c)=>n+(c.votes||0),0);if(!Number.isSafeInteger(total))fail(r.id+': total votes exceeds the supported range.');
  const estimatedVoteIn=r.estimatedVoteIn??null;
  if(estimatedVoteIn!==null&&(typeof estimatedVoteIn!=='number'||!Number.isFinite(estimatedVoteIn)||estimatedVoteIn<0||estimatedVoteIn>100))fail(r.id+': estimatedVoteIn must be 0–100 or null.');
  if(!['uncalled','called'].includes(r.status))fail(r.id+': status must be uncalled or called.');
  const calledWinnerId=r.calledWinnerId??null;
  if(r.status==='called'&&(!calledWinnerId||!candidateIds.has(calledWinnerId)))fail(r.id+': a called race needs a valid calledWinnerId.');
  if(r.status==='uncalled'&&calledWinnerId!==null)fail(r.id+': an uncalled race cannot have a winner.');
  const calledAt=r.status==='called'?timestamp(r.calledAt,r.id+' calledAt',now):null;
  const callSource=r.callSource?shortString(r.callSource,'Call source',100):source.name;
  races.push({...config,candidates,totalVotes:hasVotes?total:null,estimatedVoteIn,updatedAt:raceTime,status:r.status,calledWinnerId,calledAt,callSource});
 }
 const chambers={};
 if(input.chambers!==undefined&&!isObject(input.chambers))fail('Chambers must be an object.');
 for(const chamber of ['senate','house']){
  const c=input.chambers?.[chamber];if(c===undefined||c===null)continue;
  if(!isObject(c))fail('Invalid '+chamber+' chamber totals.');
  const total=chamber==='senate'?100:435;
  const normalized={};for(const field of ['dem','rep','other','uncalled'])normalized[field]=count(c[field],chamber+' '+field);
  if(normalized.dem+normalized.rep+normalized.other+normalized.uncalled!==total)fail(chamber+' seat totals must sum to '+total+'.');
  if(![null,'DEM','REP','OTHER'].includes(c.control??null))fail('Invalid '+chamber+' control.');
  normalized.control=c.control??null;chambers[chamber]=normalized;
 }
 return {schemaVersion:1,electionDate:ELECTION_DATE,source,updatedAt,races,chambers};
}
export function waitingRace(config){return {...config,status:'waiting',updatedAt:null,estimatedVoteIn:null,totalVotes:null,calledWinnerId:null,candidates:[{id:'pending-dem',name:'Awaiting candidate',party:'DEM',votes:null},{id:'pending-rep',name:'Awaiting candidate',party:'REP',votes:null}]};}
export function allRaces(feed){const map=new Map((feed?.races||[]).map(r=>[r.id,r]));return RACE_CONFIG.map(c=>map.get(c.id)||waitingRace(c));}
export function margin(r){if(r.totalVotes===null||r.totalVotes===0||r.candidates.length<2)return null;const sorted=[...r.candidates].sort((a,b)=>b.votes-a.votes);return 100*(sorted[0].votes-sorted[1].votes)/r.totalVotes;}
export function sortedCandidates(r){return [...r.candidates].sort((a,b)=>(b.votes??-1)-(a.votes??-1));}
export function createDemo(now=Date.now()){
 const names=[['Jordan Ellis','Alex Bennett'],['Morgan Hayes','Taylor Brooks'],['Casey Parker','Avery Grant'],['Sam Rivers','Jamie Lawson'],['Riley Carter','Cameron Blake'],['Robin Torres','Drew Mitchell'],['Skyler Davis','Peyton Cole'],['Quinn Harris','Reese Walker'],['Emerson Gray','Hayden Foster'],['Rowan Pierce','Finley Scott'],['Elliot James','Dakota Ford'],['Charlie Reed','Kendall Price'],['Sage Adams','Logan Bell'],['Alex Rivera','Jordan Clarke'],['Parker Wells','Reagan Hart'],['Jesse Monroe','Harper West'],['Cameron Lane','Avery Ross'],['Remy Collins','Blake Sullivan'],['Noel Anderson','Taylor Young'],['Rory Phillips','Dylan Moore'],['Carter Silva','Morgan Wright']];
 const shares=[.482,.494,.431,.527,.509,.492,.503,.514,.519,.548,.376,.538,.452,.512,.477,.505,.486,.508,.517,.527,.465];
 const reports=[43,72,81,91,68,59,83,87,76,94,97,96,93,78,89,71,66,57,81,92,74];
 const called=new Set(['KS-sen','MN-sen','MS-sen','NH-sen','SC-sen','NY-17']);
 return validateFeed({schemaVersion:1,electionDate:ELECTION_DATE,source:{name:'Fictional demo data'},updatedAt:new Date(now).toISOString(),chambers:{senate:{dem:47,rep:48,other:0,uncalled:5,control:null},house:{dem:207,rep:204,other:0,uncalled:24,control:null}},races:RACE_CONFIG.map((r,i)=>{
 const total=r.chamber==='senate'?Math.round((760000+i*87933)*(reports[i]/100)):Math.round(180000+i*937);
 const dv=Math.round(total*shares[i]);const rv=total-dv;const isCalled=called.has(r.id);
 return {id:r.id,updatedAt:new Date(now-(i%5)*10000).toISOString(),estimatedVoteIn:reports[i],status:isCalled?'called':'uncalled',candidates:[{id:r.id+'-dem',name:names[i][0],party:'DEM',votes:dv},{id:r.id+'-rep',name:names[i][1],party:'REP',votes:rv}],calledWinnerId:isCalled?r.id+(dv>rv?'-dem':'-rep'):null,calledAt:isCalled?new Date(now-(i+1)*110000).toISOString():null,callSource:'Demo projection'};
 })},now);
}
