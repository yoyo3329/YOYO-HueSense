from __future__ import annotations
from pathlib import Path
import json, re
from .security import PackageSecurityError, validate_relative_inside, validate_install_destination

REQ = [
    "schema","package_id","package_version","phase","stage","mode",
    "formal_claim_allowed","required_dataset","entrypoint","install_plan",
    "expected_outputs","success_gate","timeout_seconds"
]

def load_manifest(package_root: Path):
    p = package_root / "yoyo_package.json"
    if not p.is_file():
        raise PackageSecurityError("PACKAGE_MANIFEST_MISSING")
    try:
        data = json.loads(p.read_text(encoding="utf-8"))
    except Exception as e:
        raise PackageSecurityError(f"PACKAGE_MANIFEST_JSON_INVALID:{e}")
    return data

def validate_manifest(m: dict, package_root: Path, repo_root: Path, settings: dict):
    for k in REQ:
        if k not in m:
            raise PackageSecurityError(f"PACKAGE_MANIFEST_REQUIRED_FIELD_MISSING:{k}")
    if m.get("schema") != "YOYO_PACKAGE_V1":
        raise PackageSecurityError("PACKAGE_SCHEMA_NOT_SUPPORTED")
    pid = str(m.get("package_id",""))
    if not re.fullmatch(r"[A-Za-z0-9._-]{3,120}", pid):
        raise PackageSecurityError("PACKAGE_ID_INVALID")
    if m.get("mode") not in ("DEV","FORMAL"):
        raise PackageSecurityError("PACKAGE_MODE_INVALID")
    if m.get("mode") == "FORMAL":
        if m.get("formal_claim_allowed") is not True:
            raise PackageSecurityError("FORMAL_PACKAGE_MUST_DECLARE_FORMAL_TRUE")
        if m.get("requires_manual_formal_confirmation") is not True:
            raise PackageSecurityError("FORMAL_PACKAGE_REQUIRES_MANUAL_CONFIRMATION")
    else:
        if m.get("formal_claim_allowed") is not False:
            raise PackageSecurityError("DEV_PACKAGE_CANNOT_ALLOW_FORMAL_CLAIM")
    ep = m.get("entrypoint") or {}
    if ep.get("type") not in settings.get("allowed_entrypoint_types", []):
        raise PackageSecurityError("ENTRYPOINT_TYPE_NOT_ALLOWED")
    ep_path = validate_relative_inside(str(ep.get("file","")), package_root, "ENTRYPOINT")
    if not ep_path.is_file():
        raise PackageSecurityError("ENTRYPOINT_FILE_MISSING")
    ext = ep_path.suffix.lower()
    expected_ext = {"cmd":".cmd","python":".py","node":".js"}[ep.get("type")]
    if ext != expected_ext:
        raise PackageSecurityError("ENTRYPOINT_EXTENSION_MISMATCH")
    for item in m.get("install_plan") or []:
        if not isinstance(item, dict):
            raise PackageSecurityError("INSTALL_PLAN_ITEM_INVALID")
        validate_relative_inside(str(item.get("source","")), package_root, "INSTALL_SOURCE")
        validate_install_destination(str(item.get("destination","")), repo_root, settings)
        if item.get("policy","CREATE_ONLY") not in ("CREATE_ONLY","CREATE_OR_UPDATE"):
            raise PackageSecurityError("INSTALL_POLICY_INVALID")
    if not isinstance(m.get("expected_outputs"), list) or not m["expected_outputs"]:
        raise PackageSecurityError("EXPECTED_OUTPUTS_REQUIRED")
    timeout = int(m.get("timeout_seconds") or 0)
    if timeout <= 0 or timeout > 86400:
        raise PackageSecurityError("TIMEOUT_OUT_OF_RANGE")
    return {"entrypoint_path": str(ep_path)}

def validate_dataset_requirement(m: dict, dataset: dict, dataset_sha: str):
    req = m.get("required_dataset") or {}
    errors=[]
    if req.get("dataset_id") and req.get("dataset_id") != dataset.get("dataset_id"):
        errors.append("DATASET_ID_MISMATCH")
    if req.get("reference_count") is not None and int(req.get("reference_count")) != int(dataset.get("reference_count") or -1):
        errors.append("DATASET_REFERENCE_COUNT_MISMATCH")
    if req.get("manifest_sha256") and req.get("manifest_sha256") != dataset_sha:
        errors.append("DATASET_MANIFEST_SHA256_MISMATCH")
    return errors
