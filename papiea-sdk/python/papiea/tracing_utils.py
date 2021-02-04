import opentracing
from jaeger_client import Config
from opentracing import Tracer, Format, Span

from papiea.api import ApiInstance
import re


def init_default_tracer() -> Tracer:
    config = Config(
        config={
            'sampler': {
                'type': 'const',
                'param': 1,
            },
            'local_agent': {
                'reporting_port': '6831',
            },
            'logging': True,
        },
        service_name='papiea-sdk-python',
        validate=True,
    )
    # this call also sets opentracing.tracer
    tracer = config.initialize_tracer()
    if tracer:
        return tracer
    else:
        return opentracing.global_tracer()


def inject_tracing_headers(tracer: Tracer, span: Span, api_instance: ApiInstance):
    http_header_carrier = {}
    tracer.inject(
        span_context=span.context,
        format=Format.HTTP_HEADERS,
        carrier=http_header_carrier)

    for key, value in http_header_carrier.items():
        api_instance.headers[key] = value


def get_special_operation_name(operation_name: str, prefix: str, version: str, kind: str) -> str:
    if re.match("^__.*_create$", operation_name):
        return f"{prefix}'s (version: {version}) constructor, kind: {kind}"
    if re.match("^__.*_delete$", operation_name):
        return f"{prefix}'s (version: {version}) destructor, kind: {kind}"
    return operation_name
