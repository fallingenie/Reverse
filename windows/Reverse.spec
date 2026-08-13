# -*- mode: python ; coding: utf-8 -*-

from pathlib import Path


root = Path(SPECPATH)
repository = root.parent
datas = [
    (str(root / "RUNTIME_PROFILE.json"), "."),
    (str(repository / "chatgpt" / "RUNTIME_PROFILE.json"), "profiles/CHATGPT_FREE"),
    (str(repository / "copilot" / "RUNTIME_PROFILE.json"), "profiles/COPILOT_M365"),
    (str(root / "RUNTIME_PROFILE.json"), "profiles/WINDOWS_STANDALONE"),
]

a = Analysis(
    [str(root / "reverse_app" / "__main__.py")],
    pathex=[str(root)],
    binaries=[],
    datas=datas,
    hiddenimports=["pypdf", "pdfplumber"],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
    optimize=0,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name="Reverse",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=True,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
coll = COLLECT(
    exe,
    a.binaries,
    a.datas,
    strip=False,
    upx=True,
    upx_exclude=[],
    name="Reverse",
)
