from __future__ import annotations

import sys

from reverse_app.cli import main
from reverse_app.gui import launch_gui


if len(sys.argv) > 1:
    raise SystemExit(main())

launch_gui()
