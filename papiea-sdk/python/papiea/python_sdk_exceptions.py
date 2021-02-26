import json
import logging
from typing import Any, List, Optional

from aiohttp import ClientResponse

from papiea.core import PapieaError
from papiea.utils import json_loads_attrs


class ApiException(Exception):
    def __init__(self, status: int, details: str):
        super().__init__(details.error.message)
        self.status = status
        self.details = details


async def check_response(resp: ClientResponse, logger: logging.Logger):
    if resp.status >= 400:
        await PapieaBaseException.raise_error(resp, logger)


class PapieaBaseException(Exception):
    # Sending in details because connected may be closed by the time
    # Info details are requested
    def __init__(self, message: str, resp: ClientResponse, details: Any):
        super().__init__(message)
        self.resp = resp
        self.details = details

    @staticmethod
    async def raise_error(resp: ClientResponse, logger: logging.Logger):
        details = await resp.text()
        try:
            details = json_loads_attrs(details)
            logger.error(f"Got exception while making request. Status: {resp.status},"
                         f" Details: {details}")
        except:
            logger.error(f"Got exception while making request. Status: {resp.status}")
            raise ApiException(resp.status, details)
        raise ApiException(resp.status, details)


class ConflictingEntityException(PapieaBaseException):
    pass


class EntityNotFoundException(PapieaBaseException):
    pass


class PermissionDeniedException(PapieaBaseException):
    pass


class ProcedureInvocationException(PapieaBaseException):
    pass


class UnauthorizedException(PapieaBaseException):
    pass


class ValidationException(PapieaBaseException):
    pass


class BadRequestException(PapieaBaseException):
    pass

class OnActionException(PapieaBaseException):
    pass

class PapieaServerException(PapieaBaseException):
    pass


class InvocationError(Exception):
    def __init__(
            self,
            status_code: int,
            message: str,
            cause
    ):
        super().__init__(message)
        self.status_code = status_code
        self.message = message
        self.name = "invocation_error"
        self.cause = cause

    @staticmethod
    def from_error(e: Exception, message: str = ''):
        if e.__class__ == ApiException:
            return InvocationError(e.status, "Procedure Handler Error", e.details.error)
        if message != '':
            return InvocationError(500, message, { "message": str(e) })
        return InvocationError(500, "Procedure Handler Error", e)

    def to_response(self) -> dict:
        return {
            "error": {
                "message": self.message,
                "name": self.name,
                "status_code": self.status_code,
                "cause": self.cause
            }
        }

class SecurityApiError(InvocationError):
    @staticmethod
    def from_error(e: Exception, message: str):
        if e.__class__ == ApiException:
            error = InvocationError(e.status, "Security API Error: " + message, e.details.error)
        else:
            error = SecurityApiError(500, "Security API Error: " + message, e)
        error.name = "security_api_error"
        return error

EXCEPTION_MAP = {
    PapieaError.ConflictingEntity.value: ConflictingEntityException,
    PapieaError.EntityNotFound.value: EntityNotFoundException,
    PapieaError.PermissionDenied.value: PermissionDeniedException,
    PapieaError.ProcedureInvocation.value: ProcedureInvocationException,
    PapieaError.Unauthorized.value: UnauthorizedException,
    PapieaError.Validation.value: ValidationException,
    PapieaError.BadRequest.value: BadRequestException,
    PapieaError.ServerError.value: PapieaServerException
}
