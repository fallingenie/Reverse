from __future__ import annotations

import json
import tkinter as tk
from pathlib import Path
from tkinter import filedialog, messagebox, ttk

from .cli import default_state_directory, doctor
from .errors import ReverseError
from .ledger import Ledger
from .pdf_refs import ingest_pdf
from .profiles import load_bundled_profile


class ReverseWindow(tk.Tk):
    def __init__(self) -> None:
        super().__init__()
        self.title("Reverse 교사용 무결성 호스트")
        self.geometry("760x560")
        self.minsize(680, 480)
        self.state_directory = tk.StringVar(value=str(default_state_directory()))
        self.rights_basis = tk.StringVar(value="UNKNOWN")
        self._build()
        self._show_doctor()

    def _build(self) -> None:
        frame = ttk.Frame(self, padding=16)
        frame.pack(fill=tk.BOTH, expand=True)
        ttk.Label(frame, text="Reverse Windows Host", font=("Segoe UI", 16, "bold")).pack(anchor=tk.W)
        ttk.Label(
            frame,
            text="모델을 내장하지 않습니다. Canon·PDF·Context Pack 무결성만 로컬 코드로 강제합니다.",
            wraplength=700,
        ).pack(anchor=tk.W, pady=(4, 16))

        state_row = ttk.Frame(frame)
        state_row.pack(fill=tk.X)
        ttk.Label(state_row, text="로컬 상태 폴더").pack(side=tk.LEFT)
        ttk.Entry(state_row, textvariable=self.state_directory).pack(side=tk.LEFT, fill=tk.X, expand=True, padx=8)
        ttk.Button(state_row, text="선택", command=self._choose_state).pack(side=tk.LEFT)

        rights_row = ttk.Frame(frame)
        rights_row.pack(fill=tk.X, pady=10)
        ttk.Label(rights_row, text="PDF 권리 근거").pack(side=tk.LEFT)
        ttk.Combobox(
            rights_row,
            textvariable=self.rights_basis,
            values=("UNKNOWN", "OWNED", "LICENSED", "EDUCATIONAL_USE_REVIEWED"),
            state="readonly",
            width=28,
        ).pack(side=tk.LEFT, padx=8)
        ttk.Button(rights_row, text="텍스트 PDF 추가", command=self._add_pdf).pack(side=tk.LEFT)
        ttk.Button(rights_row, text="무결성 상태", command=self._show_doctor).pack(side=tk.LEFT, padx=8)

        ttk.Label(frame, text="상태와 한계").pack(anchor=tk.W, pady=(8, 4))
        self.output = tk.Text(frame, wrap=tk.WORD, height=20, font=("Consolas", 10))
        self.output.pack(fill=tk.BOTH, expand=True)
        self.output.configure(state=tk.DISABLED)

    def _choose_state(self) -> None:
        selected = filedialog.askdirectory(initialdir=self.state_directory.get())
        if selected:
            self.state_directory.set(selected)
            self._show_doctor()

    def _write(self, value: object) -> None:
        self.output.configure(state=tk.NORMAL)
        self.output.delete("1.0", tk.END)
        self.output.insert(tk.END, json.dumps(value, ensure_ascii=False, indent=2))
        self.output.configure(state=tk.DISABLED)

    def _show_doctor(self) -> None:
        try:
            self._write(doctor(self.state_directory.get()))
        except ReverseError as error:
            self._write({"ok": False, "error": str(error)})

    def _add_pdf(self) -> None:
        selected = filedialog.askopenfilename(filetypes=[("PDF", "*.pdf")])
        if not selected:
            return
        try:
            profile = load_bundled_profile()
            state = Path(self.state_directory.get()).resolve()
            ledger = Ledger(state / "ledger.ndjson")
            ledger.initialize(profile)
            manifest, destination = ingest_pdf(
                selected,
                state / "references",
                rights_basis=self.rights_basis.get(),
            )
            ledger.append(
                "PDF_REFERENCE_ADDED",
                "TEACHER",
                {
                    "document_id": manifest["document_id"],
                    "document_sha256": manifest["sha256"],
                    "status": manifest["status"],
                    "rights_basis": manifest["rights_basis"],
                    "chunk_count": len(manifest["chunks"]),
                },
                profile,
            )
            self._write({
                "ok": True,
                "status": manifest["status"],
                "output": str(destination),
                "chunks": len(manifest["chunks"]),
                "notice": "NEEDS_REVIEW는 오류가 아니라 교사 검토 대기 상태입니다.",
            })
        except ReverseError as error:
            messagebox.showerror("PDF 추가 실패", str(error))
            self._write({"ok": False, "error": str(error)})


def launch_gui() -> None:
    ReverseWindow().mainloop()
