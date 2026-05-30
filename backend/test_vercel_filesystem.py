import importlib
import os


def test_main_import_uses_tmp_static_dirs_on_vercel(monkeypatch):
    monkeypatch.setenv("VERCEL", "1")

    main = importlib.import_module("backend.main")
    tmp_root = os.path.abspath("/tmp")

    assert str(main.OUTPUTS_DIR).startswith(tmp_root)
    assert str(main.UPLOADS_DIR).startswith(tmp_root)
    assert main.OUTPUTS_DIR.exists()
    assert (main.UPLOADS_DIR / "audio").exists()
