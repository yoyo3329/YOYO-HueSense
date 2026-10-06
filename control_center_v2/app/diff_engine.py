from __future__ import annotations

KEYS=[
    "dataset_id","dataset_manifest_sha256","reference_count","input_count","output_count",
    "status","formal_claim_allowed","schema_version","code_version","config_sha256",
    "environment_fingerprint"
]

def diff_manifests(previous, current):
    if not previous:
        return {
            "ADDED":{k:current.get(k) for k in KEYS if k in current},
            "REMOVED":{},
            "CHANGED":{},
            "UNCHANGED":{}
        }
    added={}; removed={}; changed={}; unchanged={}
    for k in KEYS:
        a=previous.get(k); b=current.get(k)
        if k not in previous and k in current: added[k]=b
        elif k in previous and k not in current: removed[k]=a
        elif a!=b: changed[k]={"previous":a,"current":b}
        elif k in current: unchanged[k]=b
    return {"ADDED":added,"REMOVED":removed,"CHANGED":changed,"UNCHANGED":unchanged}
