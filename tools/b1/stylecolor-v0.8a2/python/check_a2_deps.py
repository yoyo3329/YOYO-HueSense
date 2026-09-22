import sys
mods=['torch','open_clip','transformers','PIL','numpy']
for m in mods:
    try:
        mod=__import__(m)
        print(f'{m}=OK '+str(getattr(mod,'__version__','')))
    except Exception as e:
        print(f'{m}=FAIL {e}')
        raise
print('A2_DEPS_OK')
