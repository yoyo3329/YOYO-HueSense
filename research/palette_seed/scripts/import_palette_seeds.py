#!/usr/bin/env python3
"""Load source-pinned 5-swatch baseline into isolated MySQL tables; stdlib + optional mysql connector.
No destructive DDL, no silent semantic scoring. Run SQL migration first.
"""
import argparse, hashlib, json, re
from pathlib import Path
DATA=Path(__file__).resolve().parents[1]/'data'/'core_five_seeds.json'
HEX=re.compile(r'^#[0-9A-F]{6}$')
def validate(path=DATA):
    d=json.loads(Path(path).read_text(encoding='utf-8'))
    assert len(d['palettes'])>0 and len(d['sources'])>0
    seen=set()
    for p in d['palettes']:
        assert p['id'] not in seen; seen.add(p['id'])
        assert p['source'] in d['sources']
        assert len(p['colors'])==5 and len(set(p['colors']))==5
        assert all(HEX.fullmatch(x) for x in p['colors'])
    return d
def load(d, host, port, user, password, database):
    try: import mysql.connector
    except ImportError: raise SystemExit('Install in separate environment: pip install mysql-connector-python')
    cn=mysql.connector.connect(host=host,port=port,user=user,password=password,database=database,autocommit=False)
    try:
        cur=cn.cursor()
        for key,s in d['sources'].items():
            cur.execute("""INSERT INTO hs_seed_source(source_key,source_url,commit_sha,source_path,license_label,attribution)
                VALUES(%s,%s,%s,%s,%s,%s) ON DUPLICATE KEY UPDATE source_url=VALUES(source_url),commit_sha=VALUES(commit_sha),source_path=VALUES(source_path),license_label=VALUES(license_label),attribution=VALUES(attribution)""",
                (key,s['url'],s['commit'],s['source_path'],s['license'],s['url']))
        for p in d['palettes']:
            digest=hashlib.sha256(json.dumps(p['colors'],separators=(',',':')).encode()).hexdigest()
            cur.execute("""INSERT INTO hs_palette_seed(external_key,source_key,palette_name,palette_family,content_sha256)
            VALUES(%s,%s,%s,%s,%s) ON DUPLICATE KEY UPDATE source_key=VALUES(source_key),palette_name=VALUES(palette_name),palette_family=VALUES(palette_family),content_sha256=VALUES(content_sha256)""",
            (p['id'],p['source'],p['name'],p['family'],digest))
            cur.execute('SELECT palette_id FROM hs_palette_seed WHERE external_key=%s',(p['id'],))
            pid=cur.fetchone()[0]
            cur.execute('DELETE FROM hs_palette_seed_color WHERE palette_id=%s',(pid,))
            for i,h in enumerate(p['colors'],1):
                cur.execute('INSERT IGNORE INTO hs_seed_color(hex_code) VALUES(%s)',(h,))
                cur.execute('SELECT color_id FROM hs_seed_color WHERE hex_code=%s',(h,))
                cid=cur.fetchone()[0]
                cur.execute('INSERT INTO hs_palette_seed_color(palette_id,position_index,color_id) VALUES(%s,%s,%s)',(pid,i,cid))
        cur.execute('SELECT COUNT(*) FROM hs_palette_seed'); n=cur.fetchone()[0]
        cur.execute('SELECT COUNT(*) FROM hs_palette_seed_color'); links=cur.fetchone()[0]
        cur.execute('SELECT COUNT(*) FROM hs_seed_color'); unique=cur.fetchone()[0]
        cur.execute('SELECT COUNT(*) FROM (SELECT palette_id FROM hs_palette_seed_color GROUP BY palette_id HAVING COUNT(*)<>5) s'); bad=cur.fetchone()[0]
        if bad:raise ValueError('Some palettes do not contain five colors')
        cn.commit()
        print(json.dumps({'palettes':n,'memberships':links,'unique_colors':unique,'invalid_palettes':bad}))
    except Exception:
        cn.rollback(); raise
    finally:cn.close()
if __name__=='__main__':
    ap=argparse.ArgumentParser()
    ap.add_argument('--validate-only',action='store_true')
    ap.add_argument('--host',default='127.0.0.1')
    ap.add_argument('--port',type=int,default=3307)
    ap.add_argument('--user',default='huesense')
    ap.add_argument('--database',default='huesense')
    ap.add_argument('--password',default=None)
    args=ap.parse_args()
    d=validate()
    print('Validated:',len(d['palettes']),'palettes,',len(set(h for p in d['palettes'] for h in p['colors'])),'unique HEX')
    if not args.validate_only:
        import os
        password=args.password or os.getenv('HUESENSE_DB_PASSWORD')
        if not password:raise SystemExit('Set HUESENSE_DB_PASSWORD or --password (avoid exposing passwords in shell history).')
        load(d,args.host,args.port,args.user,password,args.database)
