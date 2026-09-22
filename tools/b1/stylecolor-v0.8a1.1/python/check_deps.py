mods=['numpy','PIL','skimage','requests']
missing=[]
for m in mods:
    try: __import__(m)
    except Exception: missing.append(m)
if missing:
    print('MISSING:'+','.join(missing)); raise SystemExit(2)
print('DEPS_OK')
