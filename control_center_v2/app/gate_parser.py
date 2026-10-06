from __future__ import annotations

def normalize_status(value):
    s=str(value or "").upper()
    if s.startswith("PASS") or s=="READY_FOR_NEXT": return "PASS"
    if s.startswith("HOLD"): return "HOLD"
    if s.startswith("FAIL") or s=="FAILED": return "FAIL"
    return None

def explain_gate(gate, explanations):
    items=[]
    for k,v in (gate or {}).items():
        if isinstance(v,(dict,list)):
            continue
        status=normalize_status(v)
        if not status:
            continue
        spec=explanations.get(k,{})
        msg=spec.get("pass" if status=="PASS" else "fail")
        if msg:
            items.append({"key":k,"value":v,"status":status,"plain":msg})
    return items
