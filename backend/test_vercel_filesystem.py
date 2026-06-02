import importlib
from pathlib import Path


def test_main_import_uses_tmp_static_dirs_on_vercel(monkeypatch):
    monkeypatch.setenv("VERCEL", "1")

    main = importlib.import_module("backend.main")
    tmp_root = Path("/tmp")

    assert main.OUTPUTS_DIR.is_relative_to(tmp_root)
    assert main.UPLOADS_DIR.is_relative_to(tmp_root)
    assert main.OUTPUTS_DIR.exists()
    assert (main.UPLOADS_DIR / "audio").exists()
