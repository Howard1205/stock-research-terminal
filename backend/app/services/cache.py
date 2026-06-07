import json
import time
import uuid
from pathlib import Path
from typing import Any, Optional


class JsonCache:
    def __init__(self, directory: Path) -> None:
        self.directory = directory
        self.directory.mkdir(parents=True, exist_ok=True)
        self.memory: dict[str, tuple[float, Any]] = {}

    def get(self, key: str, ttl_seconds: int) -> Optional[Any]:
        now = time.time()
        memory_item = self.memory.get(key)
        if memory_item and now - memory_item[0] <= ttl_seconds:
            return memory_item[1]

        path = self.directory / f"{key}.json"
        if not path.exists():
            return None

        try:
            payload = json.loads(path.read_text(encoding="utf-8"))
            created_at = float(payload["created_at"])
            if now - created_at > ttl_seconds:
                return None
            value = payload["value"]
            self.memory[key] = (created_at, value)
            return value
        except (OSError, ValueError, KeyError, TypeError):
            return None

    def get_stale(self, key: str) -> Optional[Any]:
        memory_item = self.memory.get(key)
        if memory_item:
            return memory_item[1]

        path = self.directory / f"{key}.json"
        if not path.exists():
            return None

        try:
            payload = json.loads(path.read_text(encoding="utf-8"))
            value = payload["value"]
            self.memory[key] = (float(payload["created_at"]), value)
            return value
        except (OSError, ValueError, KeyError, TypeError):
            return None

    def set(self, key: str, value: Any) -> None:
        created_at = time.time()
        self.memory[key] = (created_at, value)
        path = self.directory / f"{key}.json"
        temp_path = path.with_name(f"{path.stem}.{uuid.uuid4().hex}.tmp")
        payload = {"created_at": created_at, "value": value}
        temp_path.write_text(
            json.dumps(payload, ensure_ascii=False, allow_nan=False),
            encoding="utf-8",
        )
        temp_path.replace(path)
