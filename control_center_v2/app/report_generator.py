from __future__ import annotations
from pathlib import Path
import base64, html, json, mimetypes, os, shutil, subprocess, time
from .common import read_json, write_json, now_iso, sha256_file
from .result_view import flatten_checks, important_diff
from .progress_journal import normalize_summary

IMAGE_EXTS={".png",".jpg",".jpeg",".webp",".gif",".bmp",".svg"}

def _h(v):
    return html.escape(str(v if v is not None else "—"))

def _li(items):
    items=items or []
    return "".join(f"<li>{_h(x)}</li>" for x in items) or "<li>—</li>"

def _data_uri(p:Path):
    mime=mimetypes.guess_type(str(p))[0] or "application/octet-stream"
    raw=p.read_bytes()
    return f"data:{mime};base64,{base64.b64encode(raw).decode('ascii')}"

def collect_images(search_roots, limit=24, max_bytes=12_000_000):
    out=[]; seen=set(); total=0
    for root in search_roots:
        root=Path(root)
        if not root.exists(): continue
        files=[root] if root.is_file() else list(root.rglob("*"))
        for p in files:
            if not p.is_file() or p.suffix.lower() not in IMAGE_EXTS: continue
            try:
                rp=str(p.resolve())
                if rp in seen: continue
                size=p.stat().st_size
                if size<=0 or total+size>max_bytes: continue
                uri=_data_uri(p)
                seen.add(rp); total+=size
                out.append({"name":p.name,"source":str(p),"data_uri":uri})
                if len(out)>=limit: return out
            except Exception:
                continue
    return out

def _browser_candidates():
    env=os.environ
    return [
        Path(r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"),
        Path(r"C:\Program Files\Microsoft\Edge\Application\msedge.exe"),
        Path(env.get("LOCALAPPDATA",""))/r"Microsoft\Edge\Application\msedge.exe",
        Path(r"C:\Program Files\Google\Chrome\Application\chrome.exe"),
        Path(r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"),
        Path(env.get("LOCALAPPDATA",""))/r"Google\Chrome\Application\chrome.exe",
    ]

def html_to_pdf(html_path:Path,pdf_path:Path):
    browser=next((p for p in _browser_candidates() if p.is_file()),None)
    if not browser:
        return {"ok":False,"reason":"EDGE_OR_CHROME_NOT_FOUND","browser":None}
    pdf_path.parent.mkdir(parents=True,exist_ok=True)
    uri=html_path.resolve().as_uri()
    cmd=[
        str(browser),"--headless","--disable-gpu","--no-pdf-header-footer",
        f"--print-to-pdf={str(pdf_path)}",uri
    ]
    try:
        cp=subprocess.run(cmd,capture_output=True,text=True,timeout=90)
        ok=cp.returncode==0 and pdf_path.is_file() and pdf_path.stat().st_size>0
        return {"ok":ok,"reason":None if ok else f"EXIT_{cp.returncode}","browser":str(browser),
                "stderr":(cp.stderr or "")[-1000:]}
    except Exception as e:
        return {"ok":False,"reason":f"{type(e).__name__}: {e}","browser":str(browser)}

def generate_report(control_root:Path,run_id:str,paths:dict,registry:dict,source_roots=None):
    control_root=Path(control_root)
    run_dir=control_root/"runs"/run_id
    if not run_dir.is_dir(): raise FileNotFoundError(f"RUN_NOT_FOUND:{run_id}")
    m=read_json(run_dir/"run_manifest.json",{}) or {}
    s=read_json(run_dir/"summary.json",{}) or {}
    g=read_json(run_dir/"gate.json",{}) or {}
    d=read_json(run_dir/"diff_from_previous.json",{}) or {}
    if not isinstance(s,dict) or not s.get("purpose"):
        s=normalize_summary(s or {},m,g,registry)
    j=read_json(run_dir/"progress_journal.json",{}) or {}

    report_root=Path(paths["result_reports_root"])/run_id
    report_root.mkdir(parents=True,exist_ok=True)
    html_path=report_root/f"{run_id}_RESULT.html"
    pdf_path=report_root/f"{run_id}_RESULT.pdf"

    stage=next((x for x in registry.get("stages",[]) if x.get("id")==m.get("stage")),{}) or {}
    phase_name=next((x.get("name") for x in registry.get("phases",[]) if x.get("id")==stage.get("phase")),None)
    checks=flatten_checks(g)
    diffs=important_diff(d)
    roots=[run_dir]
    for x in source_roots or []:
        if x: roots.append(Path(x))
    images=collect_images(roots)

    before=(j.get("progress_before") or {})
    after=(j.get("progress_after") or {})
    progressed=bool(j.get("mainline_progressed") or m.get("affects_stage_state"))
    ptxt=f"{before.get('passed','—')} / {before.get('total','—')} → {after.get('passed','—')} / {after.get('total','—')}" if before or after else "—"

    check_html="".join(
        f"<div class='check {'ok' if x['status']=='PASS' else 'bad'}'><span>{'✓' if x['status']=='PASS' else '✕'}</span><div><b>{_h(x['key'])}</b><small>{_h(x['status'])}</small></div></div>"
        for x in checks[:40]
    ) or "<p class='muted'>沒有可展開的 Gate checks。</p>"

    diff_html="".join(
        f"<tr><td><b>{_h(x.get('type'))}</b></td><td>{_h(x.get('field'))}</td><td>{_h(x.get('from',x.get('value','—')))}</td><td>{_h(x.get('to','—'))}</td></tr>"
        for x in diffs
    ) or "<tr><td colspan='4'>沒有重要欄位變化。</td></tr>"

    img_html="".join(
        f"<figure><img src='{x['data_uri']}' alt='{_h(x['name'])}'><figcaption>{_h(x['name'])}</figcaption></figure>"
        for x in images
    ) or "<p class='muted'>本 Run 沒有可內嵌的圖片輸出。</p>"

    html_doc=f"""<!doctype html>
<html lang="zh-Hant"><head><meta charset="utf-8"><title>{_h(run_id)} Result</title>
<style>
*{{box-sizing:border-box}}body{{font-family:Inter,'Microsoft JhengHei',sans-serif;margin:0;background:#f4f6f8;color:#19232d;user-select:text}}
main{{max-width:1100px;margin:0 auto;padding:34px}}.card{{background:#fff;border:1px solid #dce4e8;border-radius:16px;padding:20px;margin:14px 0}}
.eyebrow{{font-size:12px;letter-spacing:.12em;color:#70808c;font-weight:800}}h1{{margin:5px 0 8px}}h2{{margin:2px 0 12px}}h3{{margin-top:22px}}
.grid{{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}}.fact{{background:#f7f9fa;border-radius:10px;padding:10px}}.fact b{{display:block;font-size:11px;color:#74838d}}
.status{{font-weight:900;font-size:22px}}.PASS{{color:#216c4d}}.HOLD,.FAIL{{color:#9a6200}}.muted{{color:#73818c}}
.q{{border-left:4px solid #7199b0;padding:8px 12px;background:#f8fafb;margin:8px 0}}ul{{margin-top:6px}}
.checks{{display:grid;grid-template-columns:1fr 1fr;gap:7px}}.check{{display:flex;gap:8px;background:#f7f9fa;padding:9px;border-radius:9px}}.check.ok>span{{color:#20714e}}.check.bad>span{{color:#b03a3a}}
table{{width:100%;border-collapse:collapse}}td,th{{border-bottom:1px solid #e5eaed;padding:8px;text-align:left;font-size:12px}}
.gallery{{display:grid;grid-template-columns:repeat(2,1fr);gap:12px}}figure{{margin:0;border:1px solid #e0e6e9;border-radius:12px;padding:8px}}img{{max-width:100%;height:auto;display:block;margin:auto}}figcaption{{font-size:11px;color:#6d7d88;padding-top:6px}}
.copybar{{position:sticky;top:0;background:#15212d;color:#fff;padding:10px 16px;z-index:3}}button{{border:0;border-radius:8px;padding:8px 11px;font-weight:800;cursor:pointer}}
pre{{white-space:pre-wrap;overflow-wrap:anywhere;background:#f5f7f8;padding:12px;border-radius:10px;font-size:11px}}
@media print{{.copybar{{display:none}}main{{padding:0}}.card{{break-inside:avoid}}}}
@media(max-width:800px){{.grid,.checks,.gallery{{grid-template-columns:1fr}}}}
</style></head><body>
<div class="copybar"><button onclick="navigator.clipboard.writeText(document.body.innerText)">Copy（複製整份報告）</button></div>
<main>
<div class="eyebrow">YOYO / HueSense · Run Result Report（執行結果報告）</div>
<h1>{_h(stage.get('name') or m.get('stage'))}</h1>
<div class="card">
<div class="grid">
<div class="fact"><b>Phase（階段）</b><span>Phase {_h(stage.get('phase'))} · {_h(phase_name)}</span></div>
<div class="fact"><b>Stage（步驟）</b><span>{_h(stage.get('name') or m.get('stage'))}</span></div>
<div class="fact"><b>Result（結果）</b><span class="status {_h(m.get('status'))}">{_h(m.get('status'))}</span></div>
<div class="fact"><b>Mainline Progress（主線進度）</b><span>{_h(ptxt)} · {'PROGRESSED' if progressed else 'NO CHANGE'}</span></div>
</div>
</div>

<div class="card" id="summary"><h2>Progress Journal（進度紀錄）</h2>
<div class="q"><b>Purpose（目的）</b><p>{_h(s.get('purpose'))}</p></div>
<div class="q"><b>Process（過程）</b><ul>{_li(s.get('process'))}</ul></div>
<div class="q"><b>Action（執行內容）</b><ul>{_li(s.get('actions'))}</ul></div>
<div class="q"><b>Result（結果）</b><p>{_h(s.get('result_summary'))}</p></div>
<div class="q"><b>Improvement（改進）</b><ul>{_li(s.get('improvements'))}</ul></div>
<div class="q"><b>Next Goal（下一步目標）</b><p><b>{_h((s.get('next_goal') or {}).get('stage'))}</b><br>{_h((s.get('next_goal') or {}).get('objective'))}</p>
<ul>{_li((s.get('next_goal') or {}).get('pass_conditions'))}</ul></div>
</div>

<div class="card"><h2>Gate Explanation（Gate 檢查）</h2><div class="checks">{check_html}</div></div>
<div class="card"><h2>Before / After（前後差異）</h2><table><thead><tr><th>類型</th><th>欄位</th><th>Before</th><th>After</th></tr></thead><tbody>{diff_html}</tbody></table></div>
<div class="card"><h2>Visual Evidence（圖像結果）</h2><div class="gallery">{img_html}</div></div>
<div class="card"><h2>Technical Details（技術細節）</h2>
<pre>{_h(json.dumps({"manifest":m,"gate":g,"journal":j},ensure_ascii=False,indent=2))}</pre></div>
</main></body></html>"""
    html_path.write_text(html_doc,encoding="utf-8")

    pdf=html_to_pdf(html_path,pdf_path)
    manifest={
        "schema":"YOYO_RESULT_REPORT_MANIFEST_V1",
        "created_at":now_iso(),
        "run_id":run_id,
        "stage":m.get("stage"),
        "status":m.get("status"),
        "html_path":str(html_path),
        "html_sha256":sha256_file(html_path),
        "pdf_path":str(pdf_path) if pdf.get("ok") else None,
        "pdf_sha256":sha256_file(pdf_path) if pdf.get("ok") else None,
        "pdf_generation":pdf,
        "visual_evidence_count":len(images),
        "source_roots":[str(x) for x in roots]
    }
    write_json(report_root/"report_manifest.json",manifest)
    return manifest
