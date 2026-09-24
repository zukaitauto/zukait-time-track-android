import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
// Minimal DOM fixture: execute the shipped search installers and their event handlers.
class Element {
 constructor(tag){this.tagName=tag.toUpperCase();this.children=[];this.dataset={};this.value='';this.className='';this.listeners={};this.textContent='';this._html='';this.classList={add:(...xs)=>this.className=[...new Set([...this.className.split(' '),...xs])].join(' '),remove:(...xs)=>this.className=this.className.split(' ').filter(x=>!xs.includes(x)).join(' ')};}
 setAttribute(k,v){this[k]=v}
 appendChild(c){c.remove();this.children.push(c);c.parentNode=this;return c}
 remove(){if(this.parentNode)this.parentNode.children=this.parentNode.children.filter(x=>x!==this);this.parentNode=null}
 replaceWith(c){const p=this.parentNode,i=p.children.indexOf(this);this.remove();p.children.splice(i,0,c);c.parentNode=p}
 insertBefore(c,b){c.remove();const i=this.children.indexOf(b);this.children.splice(i<0?this.children.length:i,0,c);c.parentNode=this}
 insertAdjacentElement(_,c){this.parentNode.insertBefore(c,this.parentNode.children[this.parentNode.children.indexOf(this)+1])}
 matches(s){return s.startsWith('#')?this.id===s.slice(1):s.startsWith('.')?this.className.split(' ').includes(s.slice(1)):this.tagName===s.toUpperCase()}
 querySelectorAll(s){return this.children.flatMap(c=>[...(s.split(',').some(x=>c.matches(x.trim()))?[c]:[]),...c.querySelectorAll(s)])}
 querySelector(s){return this.querySelectorAll(s)[0]||null}
 closest(s){return this.matches(s)?this:this.parentNode?.closest(s)||null}
 get options(){return this.tagName==='SELECT'?this.children:undefined}
 set innerHTML(h){this._html=h;this.children=[];for(const m of h.matchAll(/<(button|option)\b([^>]*)>([\s\S]*?)<\/\1>/g)){const c=new Element(m[1]);c.textContent=m[3];for(const a of m[2].matchAll(/([\w-]+)="([^"]*)"/g)){if(a[1].startsWith('data-'))c.dataset[a[1].slice(5)]=a[2];else c[a[1]==='class'?'className':a[1]]=a[2]}this.appendChild(c)}}
 get innerHTML(){return this.tagName==='SELECT'?this.children.map(c=>'<option value="'+c.value+'">'+c.textContent+'</option>').join(''):this._html}
 addEventListener(k,fn){(this.listeners[k]||=[]).push(fn)}
 dispatchEvent(e){for(const fn of this.listeners[e.type]||[])fn(e)}
}
const document=new Element('document');document.head=document.appendChild(new Element('head'));
document.createElement=tag=>new Element(tag);document.getElementById=id=>document.querySelector('#'+id);
const root=document.appendChild(new Element('div'));root.id='supervisorView';const card=root.appendChild(new Element('div'));card.className='card';const heading=card.appendChild(new Element('h3'));heading.textContent='Assign / Update Job Card';const label=card.appendChild(new Element('label'));const original=label.appendChild(new Element('select'));original.id='sj';
const pending=[],assigned=[],alerts=[];
const ctx={document,console,Event:class {constructor(type){this.type=type}},setTimeout:fn=>pending.push(fn),render(){},renderSupervisor(){},openModal(){},closeModal(){},alert:x=>alerts.push(x),assignJobExisting(){assigned.push(document.getElementById('sj').value)}};ctx.window=ctx;vm.createContext(ctx);
vm.runInContext(`let me={role:'Supervisor'};let state={jobs:[{no:'JC100',reg:'123 AB',vehicle:'Toyota Corolla',year:2020,brand:'Toyota'},{no:'JC200',reg:'456 CD',make:'Honda',model:'Civic',year:2021},{no:'ID001',vehicle:'Ideal Time'}]};`,ctx);
const source=fs.readFileSync('app/src/main/assets/v74_updates.js','utf8');vm.runInContext(source.slice(source.indexOf('/* V136 ASSIGN JOB CARD')),ctx);
const flush=()=>{while(pending.length)pending.shift()()};flush();assert.equal(ctx.me,undefined,'fixture must use the real lexical session');
const input=document.getElementById('v137JobSearch');assert.ok(input,'search must initialize for lexical Supervisor session');let select=document.getElementById('sj');assert.equal(select.tagName,'SELECT');assert.ok(!select.options.some(o=>o.value==='ID001'));
function search(q){input.value=q;input.dispatchEvent({type:'input'});return label.querySelector('.v137-results')}
for(const term of ['JC100','123AB','Corolla','2020','Toyota','Honda','Civic'])assert.ok(search(term).querySelector('button'),'must find '+term);
search('ID001');assert.equal(label.querySelector('.v137-results').querySelector('button'),null);
search('Corolla').querySelector('button').onclick();ctx.assignJobExisting();assert.equal(assigned.at(-1),'JC100');
ctx.render();ctx.renderSupervisor();flush();assert.equal(document.getElementById('sj'),select,'keep selected control connected to listeners');assert.equal(document.getElementById('v137JobSearch'),input);
search('Civic').querySelector('button').onclick();ctx.assignJobExisting();assert.equal(assigned.at(-1),'JC200','selection after rerender reaches assignment logic');
search('does not exist');const n=assigned.length;ctx.assignJobExisting();assert.equal(assigned.length,n,'invalid search must not reuse previous assignment');assert.match(alerts.at(-1),/Search and select/);
search('123 AB');input.dispatchEvent({type:'keydown',key:'Enter',preventDefault(){}});ctx.assignJobExisting();assert.equal(assigned.at(-1),'JC100');
assert.equal(label.querySelectorAll('#v137JobSearch').length,1);assert.equal(label.querySelectorAll('#sj').length,1);
console.log('Assignment search UI tests passed: lexical session, all search fields, ID001 exclusion, click/Enter, refresh and assignment handoff');

