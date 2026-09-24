import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

class Element {
  constructor(tag='div'){
    this.tagName=tag.toUpperCase();this.value='';this.innerHTML='';this.children=[];this.className='';
    this.classList={
      add:(...xs)=>{const s=new Set(this.className.split(/\s+/).filter(Boolean));xs.forEach(x=>s.add(x));this.className=[...s].join(' ')},
      remove:(...xs)=>{this.className=this.className.split(/\s+/).filter(x=>x&&!xs.includes(x)).join(' ')},
      contains:x=>this.className.split(/\s+/).includes(x)
    };
  }
  appendChild(x){this.children.push(x);return x}
  get options(){return this.tagName==='SELECT'?this.children:undefined}
}
const elements=new Map();
const el=(id,tag='div')=>{const x=new Element(tag);x.id=id;elements.set(id,x);return x};
const input=el('supervisorJobSearch','input');
const select=el('sj','select');
select.appendChild(Object.assign(new Element('option'),{value:'',textContent:''}));
const results=el('supervisorJobSearchResults');results.className='supervisor-job-search-results hidden';
const selected=el('supervisorJobSelected');selected.className='supervisor-job-selected hidden';
const tech=el('se2','select');tech.value='EMP001';
const time=el('st2','input');time.value='2.00';

const state={jobs:[
  {no:'JC100',reg:'123 AB',vehicle:'Toyota Corolla',year:'2020',brand:'Toyota',createdAt:3},
  {no:'JC200',reg:'456 CD',vehicle:'Honda Civic',make:'Honda',model:'Civic',year:'2021',brand:'Honda',createdAt:2},
  {no:'ID001',reg:'0000',vehicle:'Ideal Time',createdAt:1}
]};
const assigned=[],alerts=[];
const ctx={
  state,console,encodeURIComponent,decodeURIComponent,
  document:{
    getElementById:id=>elements.get(id)||null,
    createElement:tag=>new Element(tag)
  },
  job:no=>state.jobs.find(j=>String(j.no).toUpperCase()===String(no).toUpperCase())||null,
  esc:v=>String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch])),
  parseWorkMinutes:v=>{const n=Number(v);return Number.isFinite(n)?n*60:NaN},
  assignJobCore:(no,emp,mins)=>assigned.push({no,emp,mins}),
  alert:x=>alerts.push(String(x))
};
ctx.window=ctx;vm.createContext(ctx);

const html=fs.readFileSync('app/src/main/assets/offline_test.html','utf8');
const start=html.indexOf('function supervisorSearchJobs(');
const end=html.indexOf('function assignJobCore(',start);
assert.ok(start>0&&end>start,'authoritative Supervisor search functions must exist in offline_test.html');
assert.match(html,/id="supervisorJobSearch"/,'authoritative Supervisor renderer must contain the visible Job Card search input');
assert.match(html,/class="supervisor-internal-job-select"/,'authoritative Supervisor renderer must retain hidden #sj assignment handoff');
assert.match(html,/supervisor-assign-grid/,'authoritative Supervisor renderer must own the Assign / Update layout');
vm.runInContext(html.slice(start,end),ctx);

const search=q=>{input.value=q;ctx.supervisorJobSearchChanged();return results.innerHTML};
for(const term of ['JC100','123AB','Corolla','2020','Toyota','Honda','Civic']){
  assert.match(search(term),/supervisor-job-result/,'must find '+term);
}
assert.doesNotMatch(search('ID001'),/supervisor-job-result/,'ID001 must stay outside normal Assign / Update search');

ctx.supervisorSelectExistingJob(encodeURIComponent('JC100'));
assert.equal(select.value,'JC100','selecting a result must set the internal #sj value');
assert.equal(input.value,'JC100','selected JC must be visible in the search box');
assert.ok(!selected.classList.contains('hidden'),'selected summary must be visible');
ctx.assignJobExisting();
assert.equal(assigned.at(-1).no,'JC100','selected JC must reach assignment logic');

input.value='Civic';
ctx.supervisorJobSearchKeydown({key:'Enter',preventDefault(){}});
assert.equal(select.value,'JC200','Enter must select the best matching Job Card');
ctx.assignJobExisting();
assert.equal(assigned.at(-1).no,'JC200','second selected JC must reach assignment logic');

input.value='does not exist';ctx.supervisorJobSearchChanged();
const before=assigned.length;ctx.assignJobExisting();
assert.equal(assigned.length,before,'invalid search text must not reuse a previous selection');
assert.match(alerts.at(-1),/Search and select a valid Job Card/);

assert.equal(state.jobs.filter(j=>j.no==='ID001').length,1,'search must not mutate ID001');
console.log('Assignment search UI tests passed: authoritative renderer, JC/reg/vehicle/year/brand search, ID001 exclusion, click/Enter selection and assignment handoff');
