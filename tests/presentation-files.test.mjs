import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {crc32,deflateRawSync} from 'node:zlib';
import {PDFDocument} from 'pdf-lib';
import {DocumentError,validatePdf,validatePptx,readLimited} from '../server/presentation-files.mjs';

// Small real ZIPs exercise archive validation without extracting to the filesystem.
function zip(entries,{compress=false}={}){
  const files=[],directory=[];let offset=0;
  for(const [filename,text] of entries){
    const name=Buffer.from(filename),raw=Buffer.from(text),data=compress?deflateRawSync(raw):raw;
    const local=Buffer.alloc(30);local.writeUInt32LE(0x04034b50);local.writeUInt16LE(20,4);local.writeUInt16LE(compress?8:0,8);local.writeUInt32LE(crc32(raw),14);local.writeUInt32LE(data.length,18);local.writeUInt32LE(raw.length,22);local.writeUInt16LE(name.length,26);
    const central=Buffer.alloc(46);central.writeUInt32LE(0x02014b50);central.writeUInt16LE(20,4);central.writeUInt16LE(20,6);central.writeUInt16LE(compress?8:0,10);central.writeUInt32LE(crc32(raw),16);central.writeUInt32LE(data.length,20);central.writeUInt32LE(raw.length,24);central.writeUInt16LE(name.length,28);central.writeUInt32LE(offset,42);
    files.push(local,name,data);directory.push(central,name);offset+=local.length+name.length+data.length;
  }
  const dir=Buffer.concat(directory),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(entries.length,8);end.writeUInt16LE(entries.length,10);end.writeUInt32LE(dir.length,12);end.writeUInt32LE(offset,16);
  return Buffer.concat([...files,dir,end]);
}
const base=[
  ['[Content_Types].xml','<Types><Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/></Types>'],
  ['ppt/presentation.xml','<p:presentation xmlns:p="urn:p" xmlns:r="urn:r"><p:sldIdLst><p:sldId id="1" r:id="r1"/></p:sldIdLst></p:presentation>'],
  ['ppt/_rels/presentation.xml.rels','<Relationships><Relationship Id="r1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/></Relationships>'],
  ['ppt/slides/slide1.xml','<p:sld xmlns:p="urn:p"/>']
];
const rejected=async(bytes,code)=>assert.rejects(validatePptx(bytes),e=>e instanceof DocumentError&&(!code||e.code===code));
test('real PowerPoint and PDF fixtures retain their bytes and report the same five slides',async()=>{
  for(const [extension,validate] of [['pptx',validatePptx],['pdf',validatePdf]]){
    const bytes=await readFile(new URL('../assets/library/confident-introductions.'+extension,import.meta.url)),before=Buffer.from(bytes);
    assert.equal((await validate(bytes)).pages,5);assert.deepEqual(bytes,before);
  }
});
test('PowerPoint fingerprints use server-read content',async()=>{
  const a=await validatePptx(zip(base)),b=await validatePptx(zip([...base,['docProps/custom.xml','<custom>changed</custom>']]));
  assert.match(a.hash,/^[a-f0-9]{64}$/);assert.notEqual(a.hash,b.hash);assert.equal(a.pages,1);
});

test('content extraction associates speaker notes and chart labels with their slide',async()=>{
  const bytes=zip([...base.slice(0,-1),
    ['ppt/slides/slide1.xml','<p:sld xmlns:p="urn:p" xmlns:a="urn:a"><a:t>Revenue overview</a:t></p:sld>'],
    ['ppt/slides/_rels/slide1.xml.rels','<Relationships><Relationship Id="n1" Type="urn:type/notesSlide" Target="../notesSlides/notesSlide1.xml"/><Relationship Id="c1" Type="urn:type/chart" Target="../charts/chart1.xml"/></Relationships>'],
    ['ppt/notesSlides/notesSlide1.xml','<p:notes xmlns:p="urn:p" xmlns:a="urn:a"><a:t>Explain the annual change.</a:t></p:notes>'],
    ['ppt/charts/chart1.xml','<c:chart xmlns:c="urn:c"><c:v>2026</c:v></c:chart>']
  ]);
  const value=await validatePptx(bytes,{includeText:true});
  assert.equal(value.slides[0].text,'Revenue overview');assert.equal(value.slides[0].notes,'Explain the annual change.');assert.equal(value.slides[0].visualText,'2026');
});
test('damaged archives, missing slides, duplicate names and traversal entries are rejected',async()=>{
  await rejected(Buffer.from('not a powerpoint'));
  await rejected(zip(base.slice(0,-1)),'invalid_pptx');
  await rejected(zip([...base,base[3]]),'unsafe_archive');
  await rejected(zip([...base,['../outside.xml','<unsafe/>']]));
});
test('active content, XML entities and linked external assets are rejected before conversion',async()=>{
  await rejected(zip([...base,['ppt/vbaProject.bin','macro']]),'active_content');
  await rejected(zip([...base,['ppt/embeddings/object.bin','object']]),'active_content');
  await rejected(zip([...base,['custom.xml','<!DOCTYPE x [<!ENTITY e SYSTEM "file:///secret">]><x>&e;</x>']]),'invalid_pptx');
  await rejected(zip([...base,['ppt/slides/_rels/slide1.xml.rels','<Relationships><Relationship TargetMode="External" Type="urn:type/image" Target="http://127.0.0.1/private"/></Relationships>']]),'external_content');
});
test('hyperlinks are allowed, animations carry a static-preview warning',async()=>{
  const result=await validatePptx(zip([...base.slice(0,-1),['ppt/slides/slide1.xml','<p:sld xmlns:p="urn:p"><p:timing/></p:sld>'],['ppt/slides/_rels/slide1.xml.rels','<Relationships><Relationship TargetMode="External" Type="urn:type/hyperlink" Target="https://school.example"/></Relationships>']]));
  assert.ok(result.warnings.some(w=>w.includes('static')));
});
test('high-ratio compressed payloads are rejected',async()=>{
  await rejected(zip([...base,['ppt/media/bomb.bin','0'.repeat(2_000_000)]],{compress:true}),'archive_limit');
});
test('PDF validation rejects malformed documents and excessive page dimensions',async()=>{
  await assert.rejects(validatePdf(Buffer.from('%PDF-broken')),e=>e.code==='invalid_pdf');
  const document=await PDFDocument.create();document.addPage([22000,10]);
  await assert.rejects(validatePdf(Buffer.from(await document.save())),e=>e.code==='invalid_pdf');
});
test('download size limits work even without a content-length header',async()=>{
  await assert.rejects(readLimited(new Response('long file'),4),/size limit/);
  await assert.rejects(readLimited(new Response('short',{headers:{'content-length':'100'}}),4),/size limit/);
  assert.equal((await readLimited(new Response('safe'),4)).toString(),'safe');
});
