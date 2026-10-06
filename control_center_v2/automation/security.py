from __future__ import annotations
from pathlib import Path, PurePosixPath
import zipfile, os, stat, re

class PackageSecurityError(RuntimeError): pass

def normalize_zip_name(name: str) -> str:
    return name.replace("\\", "/")

def validate_zip_member_name(name: str):
    n = normalize_zip_name(name)
    p = PurePosixPath(n)
    if not n or n.startswith("/") or n.startswith("\\"):
        raise PackageSecurityError(f"ABSOLUTE_ZIP_PATH:{name}")
    if re.match(r"^[A-Za-z]:", n):
        raise PackageSecurityError(f"WINDOWS_DRIVE_ZIP_PATH:{name}")
    if any(part in ("..", "") for part in p.parts):
        raise PackageSecurityError(f"ZIP_PATH_TRAVERSAL:{name}")
    return n

def is_zip_symlink(info: zipfile.ZipInfo) -> bool:
    mode = (info.external_attr >> 16) & 0xFFFF
    return stat.S_ISLNK(mode)

def inspect_zip(zip_path: Path, settings: dict):
    total = 0
    file_count = 0
    with zipfile.ZipFile(zip_path, "r") as z:
        names = []
        for info in z.infolist():
            n = validate_zip_member_name(info.filename)
            names.append(n)
            if info.is_dir():
                continue
            if is_zip_symlink(info):
                raise PackageSecurityError(f"ZIP_SYMLINK_BLOCKED:{n}")
            file_count += 1
            total += int(info.file_size or 0)
            if file_count > int(settings["max_zip_files"]):
                raise PackageSecurityError("ZIP_TOO_MANY_FILES")
            if info.file_size > int(settings["max_single_file_uncompressed_bytes"]):
                raise PackageSecurityError(f"ZIP_SINGLE_FILE_TOO_LARGE:{n}")
            if total > int(settings["max_zip_uncompressed_bytes"]):
                raise PackageSecurityError("ZIP_UNCOMPRESSED_SIZE_LIMIT")
            if info.compress_size and info.file_size / max(1, info.compress_size) > float(settings["max_compression_ratio"]):
                raise PackageSecurityError(f"ZIP_COMPRESSION_RATIO_LIMIT:{n}")
        if "yoyo_package.json" not in names:
            raise PackageSecurityError("YOYO_PACKAGE_MANIFEST_MISSING_AT_ZIP_ROOT")
    return {"file_count": file_count, "uncompressed_bytes": total}

def safe_extract(zip_path: Path, staging_dir: Path):
    staging_dir.mkdir(parents=True, exist_ok=True)
    root = staging_dir.resolve()
    with zipfile.ZipFile(zip_path, "r") as z:
        for info in z.infolist():
            n = validate_zip_member_name(info.filename)
            target = (staging_dir / Path(n)).resolve()
            try:
                target.relative_to(root)
            except Exception:
                raise PackageSecurityError(f"ZIP_ESCAPE_BLOCKED:{n}")
            if info.is_dir():
                target.mkdir(parents=True, exist_ok=True)
            else:
                target.parent.mkdir(parents=True, exist_ok=True)
                with z.open(info, "r") as src, target.open("wb") as dst:
                    while True:
                        b = src.read(1024 * 1024)
                        if not b: break
                        dst.write(b)

def validate_relative_inside(rel: str, root: Path, label: str):
    if not isinstance(rel, str) or not rel.strip():
        raise PackageSecurityError(f"{label}_EMPTY")
    raw = rel.replace("\\", "/")
    if raw.startswith("/") or re.match(r"^[A-Za-z]:", raw):
        raise PackageSecurityError(f"{label}_ABSOLUTE_BLOCKED")
    p = PurePosixPath(raw)
    if ".." in p.parts:
        raise PackageSecurityError(f"{label}_TRAVERSAL_BLOCKED")
    target = (root / Path(*p.parts)).resolve()
    try:
        target.relative_to(root.resolve())
    except Exception:
        raise PackageSecurityError(f"{label}_ESCAPE_BLOCKED")
    return target

def validate_install_destination(destination: str, repo_root: Path, settings: dict):
    raw = destination.replace("\\", "/").strip("/")
    if not raw:
        raise PackageSecurityError("INSTALL_DESTINATION_EMPTY")
    parts = PurePosixPath(raw).parts
    if ".." in parts or re.match(r"^[A-Za-z]:", raw):
        raise PackageSecurityError("INSTALL_DESTINATION_TRAVERSAL_OR_ABSOLUTE")
    first = parts[0].lower()
    allowed = {x.lower() for x in settings.get("allowed_install_prefixes", [])}
    protected = {x.lower() for x in settings.get("protected_repo_prefixes", [])}
    if first in protected:
        raise PackageSecurityError(f"INSTALL_DESTINATION_PROTECTED:{first}")
    if first not in allowed:
        raise PackageSecurityError(f"INSTALL_DESTINATION_NOT_ALLOWLISTED:{first}")
    dest = (repo_root / Path(*parts)).resolve()
    try:
        dest.relative_to(repo_root.resolve())
    except Exception:
        raise PackageSecurityError("INSTALL_DESTINATION_ESCAPES_REPO")
    return dest
