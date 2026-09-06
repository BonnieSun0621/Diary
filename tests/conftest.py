"""测试夹具：使用临时数据库文件。"""
import os
import tempfile

_tmpdir = tempfile.mkdtemp(prefix="diary-test-")
os.environ["DIARY_DB"] = os.path.join(_tmpdir, "test_diary.db")

import pytest
from fastapi.testclient import TestClient

from backend import database
from backend.app import app, ensure_db


@pytest.fixture()
def client():
    database.reset_file()
    ensure_db()
    with TestClient(app) as c:
        yield c
