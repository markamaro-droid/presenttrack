import {createHash} from 'node:crypto';
import path from 'node:path';
import yauzl from 'yauzl';
import {XMLParser,XMLValidator} from 'fast-xml-parser';
import {PDFDocument} from 'pdf-lib';

export class DocumentError extends Error {constructor(code,message){super(message);this.code=code;}}
const fail=(code,message)=>{throw new DocumentError(code,message)};
export const MAX_ORIGINAL=50_000_000,MAX_PREVIEW=100_000_000;
export async function readLimited(response,limit){
  if(!response.ok)throw Error('File download failed');
  if(Number(response.headers.get('content-length'))>limit) {await response.body?.cancel();throw Error('File exceeds size limit');}
  const chunks=[];let total=0;
  try{for await(const chunk of response.body){total+=chunk.byteLength;if(total>limit)throw Error('File exceeds size limit');chunks.push(Buffer.from(chunk));}}
  catch(error){await response.body?.cancel().catch(()=>{});throw error}
  return Buffer.concat(chunks,total);
}
export async function validatePdf(bytes,limit=MAX_ORIGINAL){
  if(!bytes.length||bytes.length>limit||bytes.subarray(0,5).toString()!=='%PDF-')fail('invalid_pdf','Choose an original PDF up to the supported size limit.');
  try{
    const doc=await PDFDocument.load(bytes,{ignoreEncryption:false,updateMetadata:false,throwOnInvalidObject:true});
    const count=doc.getPageCount();
    if(count<1||count>500)fail('slide_limit','Use a document with 1 to 500 slides or pages.');
    for(const page of doc.getPages()){
      const {width,height}=page.getSize();if(!Number.isFinite(width)||!Number.isFinite(height)||width<1||height<1||width>20000||height>20000)fail('invalid_pdf','This PDF contains an unsupported page size.');
    }
    return {pages:count,warnings:[]};
  }catch(error){if(error instanceof DocumentError)throw error;fail('invalid_pdf','This PDF could not be read. Remove password protection or export a new PDF.');}
}
const array=value=>value==null?[]:Array.isArray(value)?value:[value];
const parser=new XMLParser({ignoreAttributes:false,processEntities:false,parseAttributeValue:false,parseTagValue:false});
const local=(object,name)=>Object.entries(object||{}).find(([key])=>key.replace(/^.*:/,'')===name)?.[1];
export async function validatePptx(bytes){
  if(!bytes.length||bytes.length>MAX_ORIGINAL)fail('file_size','Choose a PowerPoint file up to 50 MB.');
  const names=new Set(),documents=new Map();let expanded=0,count=0,hasMedia=false,hasAnimation=false;
  try{
    await new Promise((resolve,reject)=>{
      yauzl.fromBuffer(bytes,{lazyEntries:true,validateEntrySizes:true,strictFileNames:true},(error,zip)=>{
        if(error)return reject(error);
        const stop=error=>{zip.close();reject(error)};
        zip.on('error',stop);zip.on('end',resolve);
        zip.on('entry',entry=>{(async()=>{
          const name=entry.fileName;
          if(++count>12000||names.has(name)||name.includes('\\')||name.includes(':')||name.startsWith('/')||name.split('/').includes('..')||/[\x00-\x1f]/.test(name))fail('unsafe_archive','The PowerPoint archive contains unsafe or duplicate paths.');
          names.add(name);expanded+=entry.uncompressedSize;
          if(entry.isEncrypted()||((entry.externalFileAttributes>>>16)&0xf000)===0xa000)fail('unsafe_archive','Encrypted or linked archive entries are unsupported.');
          if(expanded>300_000_000||entry.uncompressedSize>MAX_ORIGINAL||entry.uncompressedSize>Math.max(1,entry.compressedSize)*500)fail('archive_limit','The expanded PowerPoint exceeds the processing limit.');
          if(/vbaproject|\/activex\/|\/embeddings\//i.test(name))fail('active_content','Remove macros, ActiveX controls and embedded objects before uploading.');
          if(/^ppt\/media\/.*\.(mp4|avi|mov|wmv|mp3|wav)$/i.test(name))hasMedia=true;
          if(!/\.(xml|rels)$/i.test(name)){zip.readEntry();return;}
          if(entry.uncompressedSize>10_000_000)fail('archive_limit','A PowerPoint XML component is too large.');
          const stream=await new Promise((resolve,reject)=>zip.openReadStream(entry,(error,value)=>error?reject(error):resolve(value)));
          const parts=[];let size=0;for await(const part of stream){size+=part.length;if(size>10_000_000)throw Error('XML limit');parts.push(part)}
          const xml=Buffer.concat(parts).toString('utf8');
          if(/<!\s*(DOCTYPE|ENTITY)/i.test(xml)||XMLValidator.validate(xml)!==true)fail('invalid_pptx','The PowerPoint contains malformed or unsafe XML.');
          const document=parser.parse(xml),stack=[document];
          while(stack.length){const node=stack.pop();if(!node||typeof node!=='object')continue;
            if(/macroenabled|vbaproject/i.test(node['@_ContentType']||''))fail('active_content','Macro-enabled presentations are not supported.');
            if(String(node['@_TargetMode']).toLowerCase()==='external'&&!String(node['@_Type']).endsWith('/hyperlink'))fail('external_content','Embed linked images and other external content in PowerPoint before uploading.');
            if(Object.keys(node).some(key=>/(^|:)timing$/.test(key)))hasAnimation=true;
            stack.push(...Object.values(node).filter(value=>value&&typeof value==='object'));
          }
          if(['[Content_Types].xml','ppt/presentation.xml','ppt/_rels/presentation.xml.rels'].includes(name))documents.set(name,document);
          zip.readEntry();
        })().catch(stop)});
        zip.readEntry();
      });
    });
    if(documents.size!==3)fail('invalid_pptx','This file is not a complete PowerPoint presentation.');
    const types=local(documents.get('[Content_Types].xml'),'Types');
    if(!array(local(types,'Override')).some(type=>type['@_PartName']==='/ppt/presentation.xml'&&type['@_ContentType']==='application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml'))fail('invalid_pptx','Choose a standard PPTX presentation.');
    const presentation=local(documents.get('ppt/presentation.xml'),'presentation'),slides=array(local(local(presentation,'sldIdLst'),'sldId'));
    if(slides.length<1||slides.length>500)fail('slide_limit','Use a PowerPoint with 1 to 500 slides.');
    const relationships=array(local(local(documents.get('ppt/_rels/presentation.xml.rels'),'Relationships'),'Relationship'));
    for(const slide of slides){
      const relation=relationships.find(item=>item['@_Id']===Object.entries(slide).find(([key])=>/^@_.*:id$/.test(key))?.[1]);
      const target=relation?.['@_Target']||'',resolved=path.posix.normalize(target.startsWith('/')?target.slice(1):'ppt/'+target);
      if(!String(relation?.['@_Type']).endsWith('/slide')||!resolved.startsWith('ppt/slides/')||!names.has(resolved))fail('invalid_pptx','The PowerPoint contains a missing slide relationship.');
    }
    const warnings=['Prepared by CloudConvert. Fonts, spacing and some PowerPoint effects may differ from the original. Download the original to compare.'];
    if(hasMedia||hasAnimation)warnings.push('Animations, audio and video are static in this PDF preview.');
    return {pages:slides.length,warnings,hash:createHash('sha256').update(bytes).digest('hex')};
  }catch(error){if(error instanceof DocumentError)throw error;fail('invalid_pptx','This PowerPoint is damaged or has an unsupported structure.');}
}
