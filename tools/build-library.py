"""Build three original, editable PPTX decks and matching vector PDF previews.
Only Python's standard library is used. Re-run when changing these built-in decks.
"""
from pathlib import Path
from xml.sax.saxutils import escape
import json
import textwrap
import zipfile

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'assets' / 'library'
DECKS = [
    ('confident-introductions', 'Confident Introductions', 'Communication', 'Practice introducing yourself and explaining one idea clearly.', [
        ('Make a clear introduction', ['Introduce yourself and your topic.', 'Tell your audience why this topic matters.', 'Preview the two ideas you will share.']),
        ('Know your audience', ['Think about what your listeners already know.', 'Choose one question your talk will answer.', 'Use familiar words and explain new terms.']),
        ('Build one main point', ['State your point in one sentence.', 'Give a concrete example from everyday life.', 'Explain how your example supports your point.']),
        ('Connect your ideas', ['Finish one thought before starting the next.', 'Use transitions such as: Here is an example.', 'Pause briefly so listeners can follow.']),
        ('Leave a clear takeaway', ['Repeat the idea you want listeners to remember.', 'Suggest one practical next step.', 'Thank your audience and invite a question.'])]),
    ('planning-a-study-week', 'Planning a Study Week', 'Student life', 'Explain a practical weekly plan with priorities, breaks and review.', [
        ('Plan a realistic week', ['Start with your classes and deadlines.', 'Choose the most important tasks for this week.', 'Leave room for rest and unexpected changes.']),
        ('Make tasks specific', ['Break a large assignment into smaller steps.', 'Replace study science with review one chapter.', 'Estimate how long each step might take.']),
        ('Protect focused time', ['Choose a place with fewer distractions.', 'Put one task in each study block.', 'Take a break when attention starts to fade.']),
        ('Check your understanding', ['Explain a concept in your own words.', 'Try a question before checking the answer.', 'Write down what you need to revisit.']),
        ('Review and adjust', ['Compare your plan with what you completed.', 'Move unfinished work into realistic time slots.', 'Keep the habits that helped you focus.'])]),
    ('presenting-a-project', 'Presenting a Project Idea', 'Project skills', 'Rehearse a project pitch from problem to solution and next steps.', [
        ('Introduce the project', ['Give your project a short, clear name.', 'Name the people you want to help.', 'Explain the problem in everyday language.']),
        ('Describe the problem', ['Use a concrete example of the difficulty.', 'Explain why the current approach falls short.', 'Separate what you know from what you assume.']),
        ('Propose your solution', ['Describe how someone would use your idea.', 'Choose two or three essential features.', 'Explain how each feature addresses the problem.']),
        ('Plan a small test', ['Build a simple version of the main feature.', 'Ask potential users to try it.', 'Observe what works and what needs improvement.']),
        ('Explain the next step', ['Summarize the value of your proposed solution.', 'Name one limitation you still need to address.', 'End with a clear request or next milestone.'])])
]
NS = 'http://schemas.openxmlformats.org/'
P = NS + 'presentationml/2006/main'
A = NS + 'drawingml/2006/main'
R = NS + 'officeDocument/2006/relationships'

def rels(items):
    return '<Relationships xmlns="' + NS + 'package/2006/relationships">' + ''.join(f'<Relationship Id="{i}" Type="{R}/{t}" Target="{target}"/>' for i, t, target in items) + '</Relationships>'

def pptx(path, slides):
    def box(i, name, text, y, height, size, color):
        paragraphs = ''.join(f'<a:p><a:r><a:rPr lang="en-US" sz="{size}"/><a:t>{escape(line)}</a:t></a:r><a:endParaRPr lang="en-US"/></a:p>' for line in text)
        return f'<p:sp><p:nvSpPr><p:cNvPr id="{i}" name="{name}"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="650000" y="{y}"/><a:ext cx="10900000" cy="{height}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/></p:spPr><p:txBody><a:bodyPr wrap="square"/><a:lstStyle>' + f'<a:lvl1pPr><a:defRPr sz="{size}"><a:solidFill><a:srgbClr val="{color}"/></a:solidFill></a:defRPr></a:lvl1pPr></a:lstStyle>' + paragraphs + '</p:txBody></p:sp>'
    group = '<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>'
    overrides = [('presentation.xml', 'presentation.main'), ('slideMasters/slideMaster1.xml', 'slideMaster'), ('slideLayouts/slideLayout1.xml', 'slideLayout')] + [(f'slides/slide{i}.xml', 'slide') for i in range(1, len(slides)+1)]
    with zipfile.ZipFile(path, 'w', zipfile.ZIP_DEFLATED) as z:
        z.writestr('[Content_Types].xml', '<Types xmlns="'+NS+'package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>'+''.join(f'<Override PartName="/ppt/{name}" ContentType="application/vnd.openxmlformats-officedocument.presentationml.{kind}+xml"/>' for name,kind in overrides)+'</Types>')
        z.writestr('_rels/.rels', rels([('rId1','officeDocument','ppt/presentation.xml')]))
        z.writestr('ppt/presentation.xml', f'<p:presentation xmlns:p="{P}" xmlns:a="{A}" xmlns:r="{R}"><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst><p:sldIdLst>'+''.join(f'<p:sldId id="{255+i}" r:id="rId{i+1}"/>' for i in range(1,len(slides)+1))+'</p:sldIdLst><p:sldSz cx="12192000" cy="6858000"/><p:notesSz cx="6858000" cy="9144000"/></p:presentation>')
        z.writestr('ppt/_rels/presentation.xml.rels', rels([('rId1','slideMaster','slideMasters/slideMaster1.xml')]+[(f'rId{i+1}','slide',f'slides/slide{i}.xml') for i in range(1,len(slides)+1)]))
        colors = 'bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"'
        z.writestr('ppt/slideMasters/slideMaster1.xml', f'<p:sldMaster xmlns:p="{P}" xmlns:a="{A}" xmlns:r="{R}"><p:cSld><p:spTree>{group}</p:spTree></p:cSld><p:clrMap {colors}/><p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst><p:txStyles><p:titleStyle/><p:bodyStyle/><p:otherStyle/></p:txStyles></p:sldMaster>')
        z.writestr('ppt/slideMasters/_rels/slideMaster1.xml.rels', rels([('rId1','slideLayout','../slideLayouts/slideLayout1.xml')]))
        z.writestr('ppt/slideLayouts/slideLayout1.xml', f'<p:sldLayout xmlns:p="{P}" xmlns:a="{A}" type="blank" preserve="1"><p:cSld name="Blank"><p:spTree>{group}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>')
        z.writestr('ppt/slideLayouts/_rels/slideLayout1.xml.rels', rels([('rId1','slideMaster','../slideMasters/slideMaster1.xml')]))
        for i, (title, lines) in enumerate(slides,1):
            shapes = box(2,'Heading',[title],900000,1000000,3400,'FFFFFF')+box(3,'Ideas',lines,2500000,3000000,2400,'DCE7FF')+box(4,'Footer',[f'PresentTrack  |  {i} / {len(slides)}'],6100000,400000,1400,'8FB5FF')
            z.writestr(f'ppt/slides/slide{i}.xml', f'<p:sld xmlns:p="{P}" xmlns:a="{A}" xmlns:r="{R}"><p:cSld><p:bg><p:bgPr><a:solidFill><a:srgbClr val="17243B"/></a:solidFill><a:effectLst/></p:bgPr></p:bg><p:spTree>{group}{shapes}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>')
            z.writestr(f'ppt/slides/_rels/slide{i}.xml.rels', rels([('rId1','slideLayout','../slideLayouts/slideLayout1.xml')]))

def pdf(path, slides):
    objects = [b'<< /Type /Catalog /Pages 2 0 R >>', b'', b'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>']
    def txt(s,x,y,size):
        s=s.replace('\\','\\\\').replace('(','\\(').replace(')','\\)')
        return f'BT /F1 {size} Tf 1 1 1 rg {x} {y} Td ({s}) Tj ET\n'
    for i,(title,lines) in enumerate(slides,1):
        content='0.09 0.14 0.23 rg 0 0 960 540 re f\n0.16 0.38 0.9 rg 0 525 960 15 re f\n'+txt(title,52,432,32)
        y=320
        for line in lines:
            for wrapped in textwrap.wrap(line,65):
                content+=txt(wrapped,64,y,22);y-=32
            y-=22
        content+=txt(f'PRESENTTRACK   /   {i} OF {len(slides)}',52,38,12)
        encoded=content.encode('ascii'); n=len(objects)+1
        objects.extend([f'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 960 540] /Resources << /Font << /F1 3 0 R >> >> /Contents {n+1} 0 R >>'.encode(),f'<< /Length {len(encoded)} >>\nstream\n'.encode()+encoded+b'endstream'])
    objects[1]=('<< /Type /Pages /Count '+str(len(slides))+' /Kids ['+' '.join(f'{4+i*2} 0 R' for i in range(len(slides)))+'] >>').encode()
    result=bytearray(b'%PDF-1.4\n');offsets=[0]
    for i,obj in enumerate(objects,1):
        offsets.append(len(result));result+=f'{i} 0 obj\n'.encode()+obj+b'\nendobj\n'
    xref=len(result);result+=f'xref\n0 {len(offsets)}\n0000000000 65535 f \n'.encode()
    result+=''.join(f'{offset:010} 00000 n \n' for offset in offsets[1:]).encode()
    result+=f'trailer\n<< /Size {len(offsets)} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF\n'.encode();path.write_bytes(result)

OUT.mkdir(parents=True,exist_ok=True)
catalog=[]
for i,(slug,title,category,description,slides) in enumerate(DECKS,1):
    pptx(OUT/(slug+'.pptx'),slides);pdf(OUT/(slug+'.pdf'),slides)
    pages=['\n'.join([t,*lines]) for t,lines in slides]
    catalog.append(dict(id=f'10000000-0000-4000-8000-{i:012}',title=title,description=description,category=category,target_seconds=180,source='builtin',file_path=f'assets/library/{slug}.pptx',file_name=slug+'.pptx',file_size=(OUT/(slug+'.pptx')).stat().st_size,preview_path=f'assets/library/{slug}.pdf',context=dict(text='\n'.join(pages),pages=pages,pagesScanned=len(pages),truncated=False),published=True))
(OUT/'catalog.json').write_text(json.dumps(catalog,indent=2)+'\n',encoding='utf-8')
columns=list(catalog[0])
def sql(value):
    if isinstance(value,bool):return str(value).lower()
    if isinstance(value,int):return str(value)
    if isinstance(value,dict):return "'"+json.dumps(value).replace("'","''")+"'::jsonb"
    return "'"+value.replace("'","''")+"'"
seed='-- Run after 20261110_presentation_library.sql. Re-running preserves admin edits.\ninsert into public.presentation_library ('+','.join(columns)+') values\n'+',\n'.join('('+','.join(sql(row[k]) for k in columns)+')' for row in catalog)+'\non conflict (id) do nothing;\n'
(ROOT/'supabase/migrations/20261110_presentation_library_seed.sql').write_text(seed,encoding='utf-8')
print('Built three original PPTX decks, PDF previews, catalog and idempotent SQL seed.')
