from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from reverse_app.errors import IntegrityError, PdfRejected
from reverse_app.pdf_refs import ingest_pdf, review_reference


class PdfReferenceTests(unittest.TestCase):
    @staticmethod
    def _make_text_pdf(path: Path) -> None:
        from reportlab.pdfgen import canvas

        document = canvas.Canvas(str(path))
        document.drawString(72, 760, "This is a text based textbook reference for Reverse testing.")
        document.drawString(72, 740, "The extracted statement is not automatically a verified fact.")
        document.save()

    def test_text_pdf_requires_teacher_review_before_active(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / "textbook.pdf"
            self._make_text_pdf(source)
            manifest, output = ingest_pdf(source, root / "references", rights_basis="OWNED")
            self.assertEqual(manifest["status"], "NEEDS_REVIEW")
            self.assertGreater(len(manifest["chunks"]), 0)
            self.assertTrue((output / "reference-pack.md").read_bytes().startswith(b"\xef\xbb\xbf"))
            self.assertFalse((output / "reference-manifest.json").read_bytes().startswith(b"\xef\xbb\xbf"))
            reviewed = review_reference(output / "reference-manifest.json", accept=True)
            self.assertEqual(reviewed["status"], "ACTIVE")
            self.assertTrue(all(chunk["teacher_review"] == "ACCEPTED" for chunk in reviewed["chunks"]))

    def test_unknown_rights_cannot_be_approved(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / "unknown-rights.pdf"
            self._make_text_pdf(source)
            _, output = ingest_pdf(source, root / "references")
            with self.assertRaisesRegex(IntegrityError, "권리 근거"):
                review_reference(output / "reference-manifest.json", accept=True)

    def test_blank_pdf_reports_ocr_required(self) -> None:
        from pypdf import PdfWriter

        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / "scan-like.pdf"
            writer = PdfWriter()
            writer.add_blank_page(width=612, height=792)
            with source.open("wb") as stream:
                writer.write(stream)
            manifest, _ = ingest_pdf(source, root / "references", rights_basis="OWNED")
            self.assertEqual(manifest["status"], "OCR_REQUIRED")
            self.assertEqual(manifest["chunks"], [])

    def test_encrypted_pdf_is_rejected_without_password_bypass(self) -> None:
        from pypdf import PdfWriter

        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / "encrypted.pdf"
            writer = PdfWriter()
            writer.add_blank_page(width=612, height=792)
            writer.encrypt("teacher-secret")
            with source.open("wb") as stream:
                writer.write(stream)
            with self.assertRaisesRegex(PdfRejected, "암호화"):
                ingest_pdf(source, root / "references", rights_basis="OWNED")


if __name__ == "__main__":
    unittest.main()
