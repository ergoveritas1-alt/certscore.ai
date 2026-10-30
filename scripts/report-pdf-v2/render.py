"""Local preview renderer over the shared, read-only canonical v2 model.

No URL is fetched. Requires ReportLab; optional assets and embedded fonts are local.
"""
import argparse
import json
import re
from pathlib import Path
from xml.sax.saxutils import escape
from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT, TA_RIGHT
from reportlab.lib.pagesizes import letter, A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen.canvas import Canvas
from reportlab.platypus import BaseDocTemplate, PageTemplate, Frame, Paragraph, Spacer, Table, TableStyle, PageBreak, KeepTogether, Flowable, Image

INK=colors.HexColor("#111827");SECONDARY=colors.HexColor("#374151");MUTED=colors.HexColor("#4B5563")
ACCENT=colors.HexColor("#0B6E99");BORDER=colors.HexColor("#D1D5DB");HAIR=colors.HexColor("#E5E7EB")
ORANGE=colors.HexColor("#8A3B04");WARM=colors.HexColor("#FBEBDA");PALE=colors.HexColor("#FFFAF4")
BLUE=colors.HexColor("#DCEEF6");GRAY=colors.HexColor("#EEF0F3")
HERE=Path(__file__).resolve().parent
STATUS_LABELS={}

def register_fonts():
    for name,file in [("Manrope","Manrope-400.ttf"),("ManropeBold","Manrope-700.ttf"),("ManropeExtra","Manrope-800.ttf"),("JetBrains","JetBrainsMono-400.ttf")]:
        pdfmetrics.registerFont(TTFont(name,str(HERE/"fonts"/file)))
    pdfmetrics.registerFontFamily("Manrope",normal="Manrope",bold="ManropeBold",italic="Manrope",boldItalic="ManropeBold")
    # Table containers also initialize a font, even when all visible cell text
    # is a Paragraph. Use the embedded family for those container resources.
    from reportlab.platypus.tables import CellStyle
    CellStyle.fontname="Manrope"

def safe(value):
    return escape(str(value or "")).replace("\n","<br/>")

def status_color(status):
    return ORANGE if status in ["Needs review","Review","Verify first","Manual review","Partial"] else ACCENT if status=="Observed" else MUTED

def status_label(status):
    # Display aliases clarify the kind of follow-up, preserving typed statuses.
    return STATUS_LABELS.get(status,status)

def draw_logo(canvas,path,x,y,width,height,radius=3):
    canvas.saveState();clip=canvas.beginPath();clip.roundRect(x,y,width,height,radius)
    canvas.clipPath(clip,stroke=0,fill=0);canvas.drawImage(path,x,y,width=width,height=height,mask="auto",preserveAspectRatio=True,anchor="c");canvas.restoreState()

class BrandLogo(Flowable):
    def __init__(self,path,width,height):super().__init__();self.path=path;self.width=width;self.height=height
    def draw(self):draw_logo(self.canv,self.path,0,0,self.width,self.height)

class Pill(Flowable):
    def __init__(self,text):super().__init__();self.status=text;self.text=status_label(text);self.width=pdfmetrics.stringWidth(self.text,"ManropeBold",9)+14;self.height=19
    def draw(self):
        c=self.canv;color=status_color(self.status);outlined=self.status in ["Partial","Manual review","Verify first"]
        c.setFillColor(colors.white if outlined else WARM if color==ORANGE else BLUE if color==ACCENT else GRAY)
        c.setStrokeColor(color if outlined else c._fillColorObj)
        c.roundRect(0,1,self.width,17,8,fill=1,stroke=1);c.setFillColor(color);c.setFont("ManropeBold",9);c.drawString(7,6,self.text)

class EvidenceCard(Table):
    def split(self,availWidth,availHeight):
        parts=super().split(availWidth,availHeight)
        if parts and getattr(self,"anchor",None):
            parts[0].anchor=self.anchor;parts[0].section=self.section
        return parts

def Card(content,width,padding=12,background=colors.white,border=BORDER,space_after=0,height=None):
    """A content-driven, splittable card with selectable text."""
    return EvidenceCard([[content]],colWidths=[width],rowHeights=[height],hAlign="LEFT",spaceAfter=space_after,
                         splitInRow=1,cornerRadii=[6,6,6,6],style=[
            ("BOX",(0,0),(-1,-1),.7,border),("BACKGROUND",(0,0),(-1,-1),background),
            ("LEFTPADDING",(0,0),(-1,-1),padding),("RIGHTPADDING",(0,0),(-1,-1),padding),
            ("TOPPADDING",(0,0),(-1,-1),padding),("BOTTOMPADDING",(0,0),(-1,-1),padding),
            ("VALIGN",(0,0),(-1,-1),"TOP")])

def equal_cards(specs,width):
    height=max(Card(content,width,**options).wrap(width,10000)[1] for content,options in specs)
    return [Card(content,width,height=height,**options) for content,options in specs]

class Anchor(Flowable):
    def __init__(self,anchor,section):
        super().__init__();self.anchor=anchor;self.section=section;self.width=0;self.height=0;self.keepWithNext=True
    def draw(self):pass

class ScoreRing(Flowable):
    def __init__(self,score):super().__init__();self.score=score;self.width=66;self.height=66
    def draw(self):
        c=self.canv;c.setStrokeColor(HAIR);c.setLineWidth(6);c.circle(33,33,27,stroke=1,fill=0)
        if self.score is not None and self.score>0:
            c.setStrokeColor(ACCENT);c.arc(6,6,60,60,startAng=90,extent=-3.6*self.score)
        c.setFillColor(INK);c.setFont("ManropeExtra",22);c.drawCentredString(33,31,str(self.score) if self.score is not None else "N/A")
        c.setFillColor(MUTED);c.setFont("Manrope",9);c.drawCentredString(33,17,"of 100")

class Timeline(Flowable):
    def __init__(self,block,width):super().__init__();self.block=block;self.width=width;self.height=65
    def draw(self):
        c=self.canv;w=self.width;window=max(self.block["windowMs"],max([e["time"] for e in self.block["events"]]+[1]));y=30
        c.setStrokeColor(BORDER);c.line(0,y,w,y)
        for e in self.block["events"]:
            x=w*e["time"]/window;c.setStrokeColor(ORANGE if e["nonEssential"] else MUTED);c.setLineWidth(1);c.line(x,y,x,y+(20 if e["nonEssential"] else 9))
        c.setFont("Manrope",9);c.setFillColor(MUTED)
        for i in range(5):c.drawString(max(0,min(w-60,w*i/4)),10,f"{round(window*i/4)} ms")

class ScoreBar(Flowable):
    def __init__(self,score,width):super().__init__();self.score=score;self.width=width;self.height=12
    def draw(self):
        c=self.canv;c.setFillColor(GRAY);c.roundRect(0,3,self.width,6,3,fill=1,stroke=0)
        if isinstance(self.score,(int,float)) and self.score>0:
            c.setFillColor(ACCENT);c.roundRect(0,3,self.width*min(100,max(0,self.score))/100,6,3,fill=1,stroke=0)

class ReportDoc(BaseDocTemplate):
    def __init__(self,path,model,pagesize,total,pages,logo=None):
        super().__init__(str(path),pagesize=pagesize,leftMargin=36,rightMargin=36,topMargin=54,bottomMargin=56,
                         title=f'{model["domain"]} - {model["framework"]} evidence report',author=model["brandName"])
        self.model=model;self.total=total;self.references=pages;self.page_map={};self.section="Executive summary";self.logo=logo;self.section_start={}
        def frame(top):return Frame(36,56,pagesize[0]-72,pagesize[1]-56-top,leftPadding=0,rightPadding=0,topPadding=0,bottomPadding=0)
        self.addPageTemplates([
            PageTemplate(id="first",frames=[frame(27)],onPageEnd=self.footer,autoNextPageTemplate="main"),
            PageTemplate(id="main",frames=[frame(54)],onPageEnd=self.footer)])
    def afterFlowable(self,flow):
        anchor=getattr(flow,"anchor",None)
        if anchor:
            self.canv.bookmarkPage(anchor);self.page_map[anchor]=self.page
            self.section=getattr(flow,"section",self.section);self.section_start[self.section]=self.page
    def footer(self,c,doc):
        width,height=self.pagesize;c.saveState();c.setFillColor(MUTED)
        if self.page>1:
            if self.logo:draw_logo(c,self.logo,36,height-34,28.5,15,1.5)
            x=72 if self.logo else 36;c.setFont("ManropeBold",9);c.drawString(x,height-27,fit(f'{self.model["brandName"]} · {self.model["domain"]}',width*.55-x,9,"ManropeBold"))
            label=self.section+(" (continued)" if self.section_start.get(self.section,self.page)<self.page else "")
            c.setFont("Manrope",9);c.drawRightString(width-36,height-27,fit(label,width*.4,9));c.setStrokeColor(BORDER);c.line(36,height-40,width-36,height-40)
        c.setStrokeColor(BORDER);c.line(36,51,width-36,51);c.setFont("Manrope",9)
        c.drawString(36,40,fit(f'{self.model["brandName"]} · {self.model["domain"]}',width-140,9))
        c.setFont("ManropeBold",9);c.drawRightString(width-36,40,f'{self.page} / {self.total or "—"}')
        c.setFont("Manrope",9);c.drawString(36,27,f'Scan ID: {self.model["scanId"]}')
        c.drawString(36,14,fit(self.model.get("footerDisclaimer",self.model["methodology"][0]),width-72,9))
        c.restoreState()

def fit(text,width,size=9,font="Manrope"):
    text=str(text)
    if pdfmetrics.stringWidth(text,font,size)<=width:return text
    while text and pdfmetrics.stringWidth(text+"…",font,size)>width:text=text[:-1]
    return text.rstrip()+"…"

class Builder:
    def __init__(self,model,paper,pages,logo,capture):
        self.m=model;self.paper=paper;self.w=paper[0]-72;self.pages=pages;self.logo=logo;self.capture=capture
        self.body=ParagraphStyle("body",fontName="Manrope",fontSize=9.75,leading=14,textColor=SECONDARY,spaceAfter=6)
        self.small=ParagraphStyle("small",parent=self.body,fontSize=9,leading=12)
        self.muted=ParagraphStyle("muted",parent=self.small,textColor=MUTED)
        self.h1=ParagraphStyle("h1",parent=self.body,fontName="ManropeExtra",fontSize=21,leading=26,textColor=INK,spaceAfter=12,keepWithNext=True)
        self.h2=ParagraphStyle("h2",parent=self.body,fontName="ManropeExtra",fontSize=11.25,leading=15,textColor=INK,spaceBefore=10,spaceAfter=6,keepWithNext=True)
        self.th=ParagraphStyle("th",parent=self.small,fontName="ManropeBold",textColor=INK,spaceAfter=0)
        self.cell=ParagraphStyle("cell",parent=self.small,spaceAfter=0)
        self.mono=ParagraphStyle("mono",parent=self.cell,fontName="JetBrains",fontSize=9,leading=12)
    def p(self,v,style=None):return Paragraph(safe(v),style or self.body)
    def rich(self,v,style=None):return Paragraph(v,style or self.body)
    def mark(self,text,anchor,section=None):
        p=self.p(text,self.h1);p.anchor=anchor;p.section=section or text;return p
    def ref(self,target):return str(self.pages.get(target,"—"))
    def table(self,block,width=None):
        width=width or self.w
        compact=block.get("compact") or block.get("title","").startswith("E.3 Software")
        ratios=block.get("widths") or [1/len(block["headers"])]*len(block["headers"]);widths=[v/sum(ratios)*width for v in ratios]
        rows=[[self.p(h,self.th) for h in block["headers"]]]
        statuses={"Observed","Needs review","Review","Partial","Manual review","Not observed","Not applicable","For information","Not tested"}
        for row in block["rows"]:
            cells=[]
            for i,val in enumerate(row):
                if str(val) in statuses and widths[i]>=pdfmetrics.stringWidth(status_label(str(val)),"ManropeBold",9)+26:
                    cells.append(Pill(str(val)));continue
                if str(val) in statuses:val=status_label(str(val))
                mono=i in block.get("mono",[]);isurl=bool(re.match(r"^https?://\S+$",str(val)))
                excerpt=i in block.get("excerptColumns",[])
                if excerpt and len(str(val))>125:
                    val=str(val)[:125].rsplit(" ",1)[0]+"…"
                label_col=i==0 and block["headers"][i] in ["Check","Disclosure","Rule","Component","Measurement","Control"]
                text_font="JetBrains" if mono or isurl else "ManropeBold" if label_col else "Manrope"
                shown=fit(val,widths[i]-12,9,text_font) if mono or isurl or compact else str(val)
                base=self.mono if mono or isurl else self.cell
                color=ORANGE if str(val).lower() in ["medium","high","critical"] or (block["headers"][i]=="After Reject click" and str(val).startswith("+")) or ("Reject" in block.get("title","") and str(val)=="Non-essential") else base.textColor
                numeric=block["headers"][i] in ["Start","Page","Elements","After Reject click","After Accept click"]
                style=ParagraphStyle("value",parent=base,textColor=color,alignment=TA_RIGHT if numeric else TA_LEFT,fontName="ManropeBold" if (color==ORANGE or label_col) and not mono else base.fontName)
                cells.append(self.p(shown,style))
            rows.append(cells)
        if len(rows)==1:rows.append([self.p("No records in this exported scope",self.muted)]+[""]*(len(widths)-1))
        t=Table(rows,colWidths=widths,repeatRows=1,hAlign="LEFT",spaceAfter=9)
        pad=1 if compact else 3
        commands=[("VALIGN",(0,0),(-1,-1),"TOP"),("LEFTPADDING",(0,0),(-1,-1),6),("RIGHTPADDING",(0,0),(-1,-1),6),("TOPPADDING",(0,0),(-1,-1),pad),("BOTTOMPADDING",(0,0),(-1,-1),pad),("LINEBELOW",(0,0),(-1,0),.75,INK),("LINEBELOW",(0,1),(-1,-1),.4,HAIR)]
        if compact:
            commands.extend([("TOPPADDING",(0,1),(-1,-1),.15),("BOTTOMPADDING",(0,1),(-1,-1),.15),("TOPPADDING",(0,0),(-1,0),3),("BOTTOMPADDING",(0,0),(-1,0),4)])
        for i,row in enumerate(block["rows"]):
            if any(str(v) in ["Needs review","Review"] for v in row):commands.append(("BACKGROUND",(0,i+1),(-1,i+1),PALE))
        for i in block.get("highlight",[]):commands.append(("BACKGROUND",(0,i+1),(-1,i+1),PALE))
        t.setStyle(TableStyle(commands));return t
    def blocks(self,blocks,width=None):
        width=width or self.w
        result=[]
        for b in blocks:
            if b["kind"]=="text":result.append(self.p(b["text"],self.muted if b.get("muted") else self.body))
            elif b["kind"]=="heading":result.append(self.p(b["text"],self.h2))
            elif b["kind"]=="table":result.extend([self.p(b["title"],self.h2),self.table(b,width)])
            elif b["kind"]=="timeline":result.extend([self.p(b["title"],self.h2),Timeline(b,self.w)])
            elif b["kind"]=="image" and self.capture:
                from PIL import Image as PILImage
                with PILImage.open(self.capture) as im:iw,ih=im.size
                w=self.w;h=min(420,w*ih/iw);w=h*iw/ih
                result.extend([Image(self.capture,width=w,height=h,hAlign="LEFT"),Spacer(1,6),self.p(b["caption"],self.muted)])
        return result
    def opener(self,s):
        title=self.p(s["title"],ParagraphStyle("opener",parent=self.h1,fontSize=18,leading=23,spaceAfter=5))
        pill=Pill(s["status"]);available=self.w*.67-28
        if pdfmetrics.stringWidth(s["title"],"ManropeExtra",18)+pill.width+8<=available:
            title=Table([[title,pill]],colWidths=[available-pill.width,pill.width],style=[("VALIGN",(0,0),(-1,-1),"MIDDLE"),("LEFTPADDING",(0,0),(-1,-1),0),("RIGHTPADDING",(0,0),(-1,-1),0),("TOPPADDING",(0,0),(-1,-1),0),("BOTTOMPADDING",(0,0),(-1,-1),0)])
            left=[title,Spacer(1,6),self.p(s["summary"],self.small)]
        else:left=[title,pill,Spacer(1,6),self.p(s["summary"],self.small)]
        links=[i for i in [*self.m["issues"],*self.m.get("otherIssues",[])] if i["evidenceTarget"]==s["id"]]
        if links:left.append(self.p("Related findings: "+", ".join(str(n) for i in links for n in i["findingNumbers"]),self.muted))
        right=[self.p("EVIDENCE SCOPE",self.th),Spacer(1,4),self.p(s["coverage"],self.small)]
        t=Table([[left,right]],colWidths=[self.w*.67,self.w*.33],hAlign="LEFT",spaceAfter=14,cornerRadii=[6,6,6,6])
        t.setStyle(TableStyle([("VALIGN",(0,0),(-1,-1),"TOP"),("BOX",(0,0),(-1,-1),.7,BORDER),("LINEBEFORE",(1,0),(1,0),.5,HAIR),("LEFTPADDING",(0,0),(-1,-1),14),("RIGHTPADDING",(0,0),(-1,-1),14),("TOPPADDING",(0,0),(-1,-1),12),("BOTTOMPADDING",(0,0),(-1,-1),12)]));t.anchor=s["id"];t.section=s["shortTitle"];return t
    def executive(self):
        m=self.m;flow=[];gap=8;tile_w=(self.w-gap*3)/4
        compact=ParagraphStyle("executiveCompact",parent=self.small,leading=11.5,spaceAfter=0)
        meta_style=ParagraphStyle("executiveMeta",parent=self.muted,fontSize=8.5,leading=11,spaceAfter=2)
        section_style=ParagraphStyle("executiveSection",parent=self.h2,fontSize=13,leading=17,spaceBefore=5,spaceAfter=5)
        title=ParagraphStyle("domain",parent=self.h1,fontSize=27,leading=32,spaceAfter=4)
        brand=[self.p(m["domain"],title),self.p(m["brandName"],self.small),self.p(f'{m["framework"]} · Starting-page score',self.small)]
        if self.logo:brand=Table([[BrandLogo(self.logo,80,80),brand]],colWidths=[94,self.w*.67-94],style=[("VALIGN",(0,0),(-1,-1),"TOP"),("LEFTPADDING",(0,0),(-1,-1),0),("RIGHTPADDING",(0,0),(-1,-1),0)])
        rating=[self.p("SCORE",self.th),self.p(m.get("rating","Assessment"),self.th)]
        right=Table([[rating,ScoreRing(m["score"])]],colWidths=[self.w*.33-70,70],style=[("VALIGN",(0,0),(-1,-1),"MIDDLE"),("LEFTPADDING",(0,0),(-1,-1),0),("RIGHTPADDING",(0,0),(-1,-1),0)])
        date=self.p(m["date"],meta_style)
        if self.logo:date=Table([["",date]],colWidths=[94,self.w*.67-94],style=[("LEFTPADDING",(0,0),(-1,-1),0),("RIGHTPADDING",(0,0),(-1,-1),0),("TOPPADDING",(0,0),(-1,-1),0),("BOTTOMPADDING",(0,0),(-1,-1),0)])
        top=Table([[brand,right],[date,self.p(f'Scan origination: {m["location"]}',meta_style)]],colWidths=[self.w*.67,self.w*.33],style=[("VALIGN",(0,0),(-1,-1),"TOP"),("LEFTPADDING",(0,0),(-1,-1),0),("RIGHTPADDING",(0,0),(-1,-1),0),("LINEBELOW",(0,-1),(-1,-1),1,INK),("BOTTOMPADDING",(0,0),(-1,-1),10)])
        flow.extend([self.p("Executive Summary",ParagraphStyle("executiveLabel",parent=self.h2,fontSize=16,leading=20,spaceAfter=10)),top,Spacer(1,7)])
        metric_specs=[]
        for index,metric in enumerate(m["metrics"]):
            hot=index==2 and metric["value"] not in ["0","Unknown"]
            content=[self.p(metric["value"],ParagraphStyle("metric",parent=self.h1,fontSize=21,leading=25,spaceAfter=2,textColor=ORANGE if hot else INK)),self.p(metric["label"],self.th),self.p("Non-essential storage. Requests separate." if index==1 else "Presence only; adequacy is separate." if index==3 else metric["note"],compact)]
            metric_specs.append((content,{"padding":8,"background":PALE if hot else colors.HexColor("#F3F4F6"),"border":colors.HexColor("#D88745") if hot else colors.HexColor("#F3F4F6")}))
        def grid(cards,width):
            rows=[]
            for start in range(0,len(cards),4):
                cells=[]
                for column in range(4):
                    if column:cells.append("")
                    cells.append(cards[start+column] if start+column<len(cards) else "")
                rows.append(cells)
            t=Table(rows,colWidths=[width,gap,width,gap,width,gap,width],hAlign="LEFT")
            t.setStyle(TableStyle([("VALIGN",(0,0),(-1,-1),"TOP"),("LEFTPADDING",(0,0),(-1,-1),0),("RIGHTPADDING",(0,0),(-1,-1),0),("TOPPADDING",(0,0),(-1,-1),0),("BOTTOMPADDING",(0,0),(-1,-1),6)]));return t
        flow.extend([grid(equal_cards(metric_specs,tile_w),tile_w),Spacer(1,3)])
        findings=[];used=set()
        for issue in m["issues"]:
            identity=issue["findingIds"][0] if issue["findingIds"] else issue["id"]
            findings.append({**issue,"priority":True,"issueTarget":issue["id"],"identity":identity});used.add(identity)
        for finding in m["findings"]:
            if finding["id"] not in used:findings.append({**finding,"priority":False,"identity":finding["id"]})
        flow.append(Table([[self.p("Report findings",section_style),self.p(f'{len(m["issues"])} selected {"priority" if len(m["issues"])==1 else "priorities"} · {len(findings)} findings',ParagraphStyle("findingCount",parent=meta_style,alignment=TA_RIGHT))]],colWidths=[170,self.w-170],style=[("VALIGN",(0,0),(-1,-1),"MIDDLE"),("LEFTPADDING",(0,0),(-1,-1),0),("RIGHTPADDING",(0,0),(-1,-1),0),("TOPPADDING",(0,0),(-1,-1),4),("BOTTOMPADDING",(0,0),(-1,-1),6)]))
        card_blocks=[]
        for number,f in enumerate(findings[:4],1):
            warm=str(f["impact"]).lower() in ["medium","high","critical"]
            excerpt=f["summary"] if len(f["summary"])<=220 else f["summary"][:220].rsplit(" ",1)[0]+"…"
            card_title=f["title"] if len(f["title"])<=110 else f["title"][:110].rsplit(" ",1)[0]+"…"
            main=[self.p(card_title,ParagraphStyle("findingTitle",parent=self.th,fontSize=10.5,leading=13,spaceAfter=4)),self.p(excerpt,compact)]
            category="Selected priority" if f["priority"] else "For information" if f["identity"]=="post_accept_consent_dependent_activity" else "Other finding"
            target=f["issueTarget"]
            meta=[self.p(category,self.th),self.p(str(f["impact"]).title()+" impact",meta_style),self.p(f["confidence"],meta_style),self.rich(f'<link href="#{target}" color="#0B6E99">Details p.{self.ref(target)}</link>',compact)]
            row=Table([[self.p(str(number),self.h2),main,meta]],colWidths=[26,self.w-150,104],style=[("VALIGN",(0,0),(-1,-1),"TOP"),("LEFTPADDING",(0,0),(-1,-1),8),("RIGHTPADDING",(0,0),(-1,-1),7),("TOPPADDING",(0,0),(-1,-1),6),("BOTTOMPADDING",(0,0),(-1,-1),5),("BOX",(0,0),(-1,-1),.7,colors.HexColor("#D88745") if warm else BORDER),("BACKGROUND",(0,0),(-1,-1),PALE if warm else colors.white),("LINEBEFORE",(0,0),(0,0),3,ORANGE if warm else colors.HexColor("#9CA3AF"))]);card_blocks.append([row,Spacer(1,5)])
        topic_flow=[self.p("Topic status",section_style)];cards=[]
        for topic in m["topics"]:
            content=[self.p(topic["title"],self.th),Spacer(1,3),self.rich(f'{safe(status_label(topic["status"]))} <link href="#{topic["target"]}" color="#0B6E99">p.{self.ref(topic["target"])}</link>',compact)]
            cards.append(Card(content,tile_w,padding=8))
        topic_flow.append(grid(cards,tile_w))
        visible=len(card_blocks)
        while True:
            excerpt_flow=[item for block in card_blocks[:visible] for item in block]
            if not findings:excerpt_flow.append(self.p("No priority findings selected. See the topic assessments and detailed evidence.",self.small))
            if len(findings)>visible:excerpt_flow.append(self.p(f'Showing {visible} of {len(findings)} findings; all findings remain in Detailed evidence.',meta_style))
            result=[*flow,*excerpt_flow,*topic_flow]
            height=sum(item.wrap(self.w,10000)[1]+item.getSpaceBefore()+item.getSpaceAfter() for item in result)
            if height<=self.paper[1]-75 or visible<=1:return result
            visible-=1
    def issue(self,i,section="Top issues and review steps"):
        inner=self.w-28;informational=i["tier"]=="For information"
        heading=self.p(i["title"],ParagraphStyle("issue",parent=self.h1,fontSize=16,leading=21,spaceAfter=9))
        left=[Pill(i["tier"]),Spacer(1,5),self.p(f'{i["impact"].title()} impact · {i["confidence"].replace(" confidence","")}',self.small)]
        right=[self.p(f'Covers finding(s) {", ".join(map(str,i["findingNumbers"]))}\n{i["owner"]}\nEvidence p.{self.ref(i["evidenceTarget"])}',ParagraphStyle("meta",parent=self.muted,alignment=TA_RIGHT))]
        meta=Table([[left,right]],colWidths=[inner*.56,inner*.44],hAlign="LEFT",style=[("VALIGN",(0,0),(-1,-1),"TOP"),("LEFTPADDING",(0,0),(-1,-1),0),("RIGHTPADDING",(0,0),(-1,-1),0),("TOPPADDING",(0,0),(-1,-1),0),("BOTTOMPADDING",(0,0),(-1,-1),6)])
        callouts=[b for b in i["blocks"] if b["kind"]=="text" and b["text"].startswith("Observed windows:")]
        body=[b for b in i["blocks"] if b not in callouts]
        content=[meta,heading,self.p(i["summary"]),*self.blocks(body,inner)]
        if not informational:
            actions=Table([[
                [self.p("WHAT TO VERIFY",self.th),Spacer(1,5),self.p(i["expected"])],
                [self.p("WHERE TO START",self.th),Spacer(1,5),*[self.p(f'{n+1}. {step}') for n,step in enumerate(i["steps"])]]]],
                colWidths=[inner*.48,inner*.52],hAlign="LEFT",splitInRow=1,style=[("VALIGN",(0,0),(-1,-1),"TOP"),("LEFTPADDING",(0,0),(-1,-1),0),("RIGHTPADDING",(0,0),(0,0),14),("RIGHTPADDING",(1,0),(1,0),0),("TOPPADDING",(0,0),(-1,-1),8),("BOTTOMPADDING",(0,0),(-1,-1),0),("LINEABOVE",(0,0),(-1,0),.4,HAIR)])
            content.extend([Spacer(1,4),actions])
            for block in callouts:content.extend([Spacer(1,7),Card(self.p(block["text"],ParagraphStyle("qualification",parent=self.small,textColor=ORANGE)),inner,8,PALE,PALE)])
        card=Card(content,self.w,14,colors.HexColor("#F8FAFC") if informational else colors.white,space_after=8)
        card.anchor=i["id"];card.section=section
        return [card]
    def retest(self):
        m=self.m;r=m["retest"];flow=[self.mark("How to re-test","retest"),self.p("One procedure for the recorded review areas. Work in staging and preserve the original before/after evidence.")]
        cards=[[self.p("1 · Back up",self.th),self.p("Save the source or configuration and a rollback version.",self.small)],[self.p("2 · Reproduce in staging",self.th),self.p("Reproduce the specific observation before making a change.",self.small)],[self.p("3 · Get sign-off",self.th),self.p("Have the responsible owner review the evidence and proposed repair.",self.small)]]
        cw=(self.w-16)/3
        t=Table([[Card(cards[0],cw,10,colors.HexColor("#F8FAFC")),"",Card(cards[1],cw,10,colors.HexColor("#F8FAFC")),"",Card(cards[2],cw,10,colors.HexColor("#F8FAFC"))]],colWidths=[cw,8,cw,8,cw],style=[("VALIGN",(0,0),(-1,-1),"TOP"),("LEFTPADDING",(0,0),(-1,-1),0),("RIGHTPADDING",(0,0),(-1,-1),0),("TOPPADDING",(0,0),(-1,-1),0),("BOTTOMPADDING",(0,0),(-1,-1),0)]);flow.extend([t,Spacer(1,10),self.p("A DevTools-only change is not a published repair.",self.muted)])
        flow.append(self.table({"headers":["Test setup","Use"],"rows":[["Starting URL",m["url"]],["Final recorded URL",m["finalUrl"]],["Region",m["location"]],["Sessions","Fresh independent browser context for each choice"],["Original observation windows","; ".join(f'{w["choice"].title()}: {w["windowMs"]/1000:g} s' for w in r["windows"])],["Comparison","Use comparable windows; keep click completion separate from decision confirmation"]],"widths":[.25,.75]}))
        flow.extend([self.p("Checks per review area",self.h2),self.table({"headers":["Review area","Do","Expected evidence"],"rows":[[i["title"],i["do"],i["expected"]] for i in r["issues"]],"widths":[.26,.37,.37]}),self.p("Keep the informational Accept baseline as a regression comparison. Close a review only when the applicable question has been resolved with evidence, not merely because a banner disappears.",self.body)])
        return flow
    def story(self):
        flow=self.executive();flow.append(PageBreak())
        if not self.m["issues"]:
            flow.extend([self.mark("Recorded findings","findings"),self.p("No priority issues were identified in the assessed evidence.")])
        else:
            flow.extend([self.mark("Top issues and review steps","findings"),self.p(f'{len(self.m["issues"])} top {"issue" if len(self.m["issues"])==1 else "issues"}. Other report findings remain in their detailed section.',self.small)])
            reviews=[i for i in self.m["issues"] if i["tier"]!="For information"];info=[i for i in self.m["issues"] if i["tier"]=="For information"]
            for n,i in enumerate(reviews):
                if n:flow.append(PageBreak())
                flow.extend(self.issue(i))
            for i in info:flow.extend([Spacer(1,8),*self.issue(i)])
            if self.m["retest"]:
                flow.extend([Spacer(1,5),Card(Paragraph(f'<b>Re-test the recorded review areas</b><br/>Use fresh independent sessions and compare the same choice paths. <link href="#retest" color="#0B6E99">Full procedure on p.{self.ref("retest")}</link>.',self.body),self.w,12,colors.HexColor("#EEF7FB"),colors.HexColor("#EEF7FB"))])
        if self.m["retest"]:flow.extend([PageBreak(),*self.retest()])
        if self.m.get("otherIssues"):
            flow.extend([PageBreak(),self.mark("Other report findings","other-findings")])
            for n,i in enumerate(self.m["otherIssues"]):
                if n:flow.append(PageBreak())
                flow.extend(self.issue(i,"Other report findings"))
        for s in self.m["sections"]:
            flow.append(PageBreak())
            if s["id"] in ["cmp-inventory","cookie-comparison","declarations","choice-reject","choice-accept","capture"]:
                flow.extend([self.mark(s["title"],s["id"]),self.p(s["summary"],self.small),self.p(s["coverage"],self.muted)])
            else:flow.append(self.opener(s))
            flow.extend(self.blocks(s["blocks"]))
        flow.extend([PageBreak(),self.mark("Methodology and sources","methodology"),self.table({"headers":["Scan setup","Recorded value"],"rows":[["Scan ID",self.m["scanId"]],["Starting URL",self.m["url"]],["Final URL",self.m["finalUrl"]],["Review focus",self.m["framework"]],["Location",self.m["location"]],["Completed (local)",self.m["date"]],["Completed (UTC)",self.m["utc"]]],"widths":[.28,.72]})])
        for line in self.m["methodology"]:flow.append(self.p(line))
        flow.extend([self.p("Assessment legend",self.h2),self.table({"headers":["Label","Meaning"],"rows":[["Observed","The named evidence or state was observed; this is not a compliance pass."],["Needs review",self.m["presentation"]["followUp"]["review"]["description"]],["Partial","Evidence or coverage is incomplete within the stated scope."],["Manual review",self.m["presentation"]["followUp"]["manual"]["description"]],["Not observed","Not seen within the stated recorded inspection."],["Not tested","No supported assessment result is available."],["For information","An explicitly informational comparison baseline, rather than a repair finding."]],"widths":[.30,.70]})])
        for name,key in [("Open online report","online"),("Open JSON workpaper","workpaper"),("Re-test this page","retest")]:
            url=self.m["links"].get(key)
            if url:flow.append(Paragraph(f'<link href="{safe(url)}" color="#0B6E99">{name}</link>',self.body))
        return flow

def render(model,path,paper,logo=None,capture=None):
    global STATUS_LABELS
    STATUS_LABELS=model["presentation"]["statusLabels"]
    register_fonts();size=letter if paper=="letter" else A4;pages={};total=0;history=[]
    for attempt in range(5):
        builder=Builder(model,size,pages,logo,capture);doc=ReportDoc(path,model,size,total,pages,logo)
        doc.build(builder.story(),canvasmaker=lambda *a,**kw:Canvas(*a,**{**kw,"initialFontName":"Manrope"}));new_pages=doc.page_map;new_total=doc.page
        history.append({"pass":attempt+1,"pages":new_total,"targets":new_pages})
        if new_pages==pages and new_total==total:break
        pages=new_pages;total=new_total
    else:raise ValueError("Cross-reference pagination did not stabilize")
    required={s["id"] for s in model["sections"]}|{i["id"] for i in [*model["issues"],*model.get("otherIssues",[])]}|{"methodology"}
    if model["retest"]:required.add("retest")
    if required-set(pages):raise ValueError(f'Missing page targets: {required-set(pages)}')
    Path(str(path)+".layout.json").write_text(json.dumps({"pages":total,"targets":pages,"passes":history,"paper":paper,"bodyFontPt":9.75,"minimumFontPt":9},indent=2)+"\n")

def main():
    p=argparse.ArgumentParser();p.add_argument("--model",required=True);p.add_argument("--out",required=True);p.add_argument("--paper",choices=["letter","a4"],default="letter");p.add_argument("--logo");p.add_argument("--capture");a=p.parse_args()
    model=json.loads(Path(a.model).read_text());render(model,Path(a.out),a.paper,a.logo,a.capture)

if __name__=="__main__":main()
