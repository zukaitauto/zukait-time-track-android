(function(){'use strict';
const esc=v=>String(v??'').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function display(v,money){if(v===null||v===undefined||v==='')return 'Not Available / Pending';return money?'OMR '+Number(v).toFixed(3):typeof v==='boolean'?(v?'Yes':'No'):String(v);}
function html(title,columns,rows,meta='',options={}){
 const cleanPrint=options.cleanPrint===true;
 const heading='<h1>ZUKAIT · '+esc(title)+'</h1>';
 const notes=cleanPrint?'':'<p>'+esc(meta)+'</p><p>Revenue ≠ cash received. Purchases ≠ allocated costs. Estimated gross profit ≠ net profit.</p>';
 const value=(r,c)=>{
  const v=r[c[1]];
  if(cleanPrint&&v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v))){
   if(c[1]==='percentage'||c[1].endsWith('_percentage'))return Number(v).toFixed(2)+'%';
   if(c[2])return Number(v).toFixed(3);
  }
  return display(v,cleanPrint?false:c[2]);
 };
 return '<!doctype html><html><head><meta charset="utf-8"><title>'+esc(title)+'</title><style>@page{size:A4 landscape;margin:12mm}body{font:10px Arial;color:#000;background:#fff}h1{font-size:19px}table{border-collapse:collapse;width:100%}td,th{border:1px solid #b7b7b7;padding:6px;text-align:left;overflow-wrap:anywhere}th{background:#eef1f4}tr{break-inside:avoid}thead{display:table-header-group}</style></head><body>'+heading+notes+'<table><thead><tr>'+columns.map(c=>'<th>'+esc(c[0])+'</th>').join('')+'</tr></thead><tbody>'+rows.map(r=>'<tr>'+columns.map(c=>'<td>'+esc(value(r,c))+'</td>').join('')+'</tr>').join('')+'</tbody></table></body></html>';
}
// Minimal uncompressed ZIP container for the five XLSX package parts.
function zipWorkbook(parts){
 const encoder=new TextEncoder(), files=[];
 let size=0, directorySize=0;
 for(const [path,content] of Object.entries(parts)){
  const name=encoder.encode(path), data=encoder.encode(content);
  let crc=-1;
  for(const byte of data){
   crc^=byte;
   for(let bit=0;bit<8;bit++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);
  }
  files.push({name,data,crc:~crc,offset:size});
  size+=30+name.length+data.length;
  directorySize+=46+name.length;
 }
 const bytes=new Uint8Array(size+directorySize+22), view=new DataView(bytes.buffer);
 const u16=(p,v)=>view.setUint16(p,v,true),u32=(p,v)=>view.setUint32(p,v,true);
 let cursor=size;
 for(const {name,data,crc,offset:p} of files){
  u32(p,0x04034b50);u16(p+4,20);u16(p+12,33);
  u32(p+14,crc);u32(p+18,data.length);u32(p+22,data.length);u16(p+26,name.length);
  bytes.set(name,p+30);bytes.set(data,p+30+name.length);
  u32(cursor,0x02014b50);u16(cursor+4,20);u16(cursor+6,20);u16(cursor+14,33);
  u32(cursor+16,crc);u32(cursor+20,data.length);u32(cursor+24,data.length);
  u16(cursor+28,name.length);u32(cursor+42,p);bytes.set(name,cursor+46);
  cursor+=46+name.length;
 }
 u32(cursor,0x06054b50);u16(cursor+8,files.length);u16(cursor+10,files.length);
 u32(cursor+12,directorySize);u32(cursor+16,size);
 return bytes;
}
function xlsx(title,columns,rows){
 const main='http://schemas.openxmlformats.org/spreadsheetml/2006/main';
 const rel='http://schemas.openxmlformats.org/officeDocument/2006/relationships';
 const packageRel='http://schemas.openxmlformats.org/package/2006/relationships';
 const content='application/vnd.openxmlformats-officedocument.spreadsheetml.';
 const xml='<?xml version="1.0" encoding="UTF-8"?>';
 const sheetName=title.replace(/[\\/*?:\[\]]/g,' ').slice(0,31).replace(/^'+|'+$/g,'').trim()||'Report';
 const cell=(value,money)=>{
  const numeric=(money||typeof value==='number')&&value!==null&&value!==undefined&&value!==''&&Number.isFinite(Number(value));
  if(numeric)return '<c'+(money?' s="1"':'')+'><v>'+Number(value)+'</v></c>';
  return '<c t="inlineStr"><is><t xml:space="preserve">'+esc(display(value,false)).replace(/[\ufffe\uffff]/g,'')+'</t></is></c>';
 };
 const row=(cells,index)=>'<row r="'+index+'">'+cells.join('')+'</row>';
 const sheetData=row(columns.map(c=>cell(c[0],false)),1)+rows.map((r,i)=>row(columns.map(c=>cell(r[c[1]],c[2])),i+2)).join('');
 return zipWorkbook({
  '[Content_Types].xml':xml+'<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Override PartName="/xl/workbook.xml" ContentType="'+content+'sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="'+content+'worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="'+content+'styles+xml"/></Types>',
  '_rels/.rels':xml+'<Relationships xmlns="'+packageRel+'"><Relationship Id="rId1" Type="'+rel+'/officeDocument" Target="xl/workbook.xml"/></Relationships>',
  'xl/workbook.xml':xml+'<workbook xmlns="'+main+'" xmlns:r="'+rel+'"><sheets><sheet name="'+esc(sheetName)+'" sheetId="1" r:id="rId1"/></sheets></workbook>',
  'xl/_rels/workbook.xml.rels':xml+'<Relationships xmlns="'+packageRel+'"><Relationship Id="rId1" Type="'+rel+'/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="'+rel+'/styles" Target="styles.xml"/></Relationships>',
  'xl/styles.xml':xml+'<styleSheet xmlns="'+main+'"><numFmts count="1"><numFmt numFmtId="164" formatCode="0.000"/></numFmts><fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>',
  'xl/worksheets/sheet1.xml':xml+'<worksheet xmlns="'+main+'"><sheetData>'+sheetData+'</sheetData></worksheet>'
 });
}
function downloadSpreadsheet(title,columns,rows,name){
 const bytes=xlsx(title,columns,rows);
 const mime='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
 if(window.AndroidBridge?.saveExportFile){
  let binary='';
  for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));
  window.AndroidBridge.saveExportFile(name+'.xlsx',mime,btoa(binary));
 }else{
  const url=URL.createObjectURL(new Blob([bytes],{type:mime}));
  const link=document.createElement('a');
  link.href=url;link.download=name+'.xlsx';link.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
 }
}
window.zukaitAccountantExports={display,html,downloadSpreadsheet};
})();
