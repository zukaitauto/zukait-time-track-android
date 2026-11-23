import fs from 'node:fs';import {JSDOM} from 'jsdom';
const dom=new JSDOM('<!doctype html><html><head></head><body></body></html>',{url:'https://native-pdf-qa.invalid',runScripts:'outside-only'}),w=dom.window;
w.state={estimates:[],estimateAudit:[]};w.me={id:'QA',role:'Manager'};w.user=()=>({name:'QA Manager'});w.openModal=()=>{};w.save=()=>{};
w.eval(fs.readFileSync('app/src/main/assets/v2/features/estimate/main_module.js','utf8'));
const fixture={id:'QA',estimateNo:'TEST-EST-001',date:'2026-10-14',type:'LS',vatEnabled:false,customerName:'QA Customer',mobile:'',makeModel:'Test Vehicle',year:'2020',registration:'TEST-80',vin:'',claimNo:'',jobCard:'',lsRows:[{id:'L',description:'Synthetic repair scope for native PDF verification',amount:150}],labourRows:[],partRows:[],lsSpareParts:0,misc:0,notes:'Synthetic test only. No production records.',showCustomerSuppliedParts:false,createdBy:'QA'};
fs.mkdirSync('app/src/androidTest/assets',{recursive:true});fs.writeFileSync('app/src/androidTest/assets/estimate-native-fixture.html',w.zukaitEstimate.estimateDocumentHtml(fixture));dom.window.close();
console.log('Native estimate fixture generated from current estimate renderer; synthetic data only');
