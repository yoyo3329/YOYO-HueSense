import importlib
mods=['torch','open_clip','transformers','huggingface_hub','safetensors','PIL','numpy']
for m in mods:
    try:
        mod=importlib.import_module(m);print(f'{m}=OK '+str(getattr(mod,'__version__','')))
    except Exception as e:
        print(f'{m}=FAIL {e}');raise
print('A2_1_DEPS_OK')
