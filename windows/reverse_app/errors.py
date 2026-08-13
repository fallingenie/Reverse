class ReverseError(Exception):
    """사용자에게 설명할 수 있는 Reverse 기본 오류."""


class IntegrityError(ReverseError):
    """원장이나 입력의 무결성 검증 실패."""


class PermissionDenied(ReverseError):
    """런타임 프로파일이 허용하지 않은 변경."""


class ContextBlocked(ReverseError):
    """필수 사실이나 인과 앵커가 없어 Context Pack 생성을 차단함."""


class PdfRejected(ReverseError):
    """지원 범위를 벗어난 PDF 입력."""
