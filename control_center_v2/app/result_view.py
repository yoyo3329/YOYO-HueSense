from __future__ import annotations

def flatten_checks(obj, prefix=""):
    out=[]
    if isinstance(obj,dict):
        for k,v in obj.items():
            key=f"{prefix}.{k}" if prefix else str(k)
            if isinstance(v,(dict,list)):
                out.extend(flatten_checks(v,key))
            elif isinstance(v,bool):
                out.append({"key":key,"status":"PASS" if v else "FAIL","value":v})
            elif isinstance(v,str) and v.upper() in ("PASS","HOLD","FAIL","STALE","READY"):
                out.append({"key":key,"status":v.upper(),"value":v})
    elif isinstance(obj,list):
        for i,v in enumerate(obj): out.extend(flatten_checks(v,f"{prefix}[{i}]"))
    return out

def important_diff(diff):
    result=[]
    changed=(diff or {}).get("CHANGED") or {}
    added=(diff or {}).get("ADDED") or {}
    removed=(diff or {}).get("REMOVED") or {}
    for k,v in list(changed.items())[:12]:
        if isinstance(v,dict) and "from" in v and "to" in v:
            result.append({"type":"CHANGED","field":k,"from":v.get("from"),"to":v.get("to")})
        else:
            result.append({"type":"CHANGED","field":k,"value":v})
    for k,v in list(added.items())[:8]: result.append({"type":"ADDED","field":k,"value":v})
    for k,v in list(removed.items())[:8]: result.append({"type":"REMOVED","field":k,"value":v})
    return result
