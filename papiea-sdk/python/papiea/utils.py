import json
from typing import Any, Optional

from .core import AttributeDict, ErrorSchemas


def json_loads_attrs(s: str) -> Any:
    def object_hook(obj):
        return AttributeDict(obj)

    return json.loads(s, object_hook=object_hook)


def validate_error_codes(error_schemas: Optional[ErrorSchemas]):
    if error_schemas:
        for code in error_schemas:
            numeric_code = int(code)
            if not isinstance(numeric_code, int) or not (400 < numeric_code < 599):
                raise Exception(f"Error description should feature status code in 4xx or 5xx, received: {numeric_code}")