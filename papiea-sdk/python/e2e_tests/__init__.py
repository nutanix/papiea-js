import logging
import os
from typing import Optional

from opentracing import Tracer
from yaml import Loader as YamlLoader
from yaml import load as load_yaml

from papiea.client import EntityCRUD
from papiea.core import AttributeDict
from papiea.tracing_utils import init_default_tracer

SERVER_PORT = int(os.environ.get("SERVER_PORT", "3000"))
PAPIEA_ADMIN_S2S_KEY = os.environ.get("PAPIEA_ADMIN_S2S_KEY", "")
PAPIEA_URL = os.getenv("PAPIEA_URL", "http://127.0.0.1:3000")

SERVER_CONFIG_HOST = "127.0.0.1"
SERVER_CONFIG_PORT = 9005
PROVIDER_PREFIX = "test_provider"
PROVIDER_VERSION = "0.1.0"
PROVIDER_ADMIN_S2S_KEY = "Sa8xaic9"
USER_S2S_KEY = ""

BUCKET_KIND = "bucket"
OBJECT_KIND = "object"

bucket_kind_dict = AttributeDict(kind=BUCKET_KIND)
object_kind_dict = AttributeDict(kind=OBJECT_KIND)

logger = logging.getLogger(__name__)
logging.basicConfig(
    level=logging.DEBUG,
    format="%(asctime)s.%(msecs)03d %(levelname)s %(module)s - %(funcName)s: %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)


def get_client(kind: str, tracer: Tracer = init_default_tracer()):
    return EntityCRUD(
        PAPIEA_URL, PROVIDER_PREFIX, PROVIDER_VERSION, kind, USER_S2S_KEY, tracer=tracer
    )


def load_yaml_from_file(filename):
    try:
        with open(filename) as f:
            return load_yaml(f, Loader=YamlLoader)
    except:
        raise


def ref_type(kind: str, description: str = '') -> AttributeDict:
    return AttributeDict(
        type='object',
        description=description,
        required=['uuid', 'kind'],
        properties=AttributeDict(
            uuid=AttributeDict(
                type='string'
            ),
            kind=AttributeDict(
                type='string',
                example=kind or 'kind_name'
            )
        )
    )
