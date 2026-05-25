from fastapi import APIRouter, Depends, Request

from app.auth.deps import get_current_user
from app.models.user import User
from app.proxy.forward import forward_to

router = APIRouter()
_CurrentUser = Depends(get_current_user)


def _set_user_state(request: Request, user: User) -> None:
    request.state.user_id = str(user.id)
    request.state.user_role = user.role


# ── Agent routes ──

@router.api_route('/api/chat/{path:path}', methods=['GET','POST','DELETE'])
async def proxy_chat(path: str, request: Request, user: User = _CurrentUser):
    _set_user_state(request, user)
    return await forward_to('agent', f'api/chat/{path}', request)

@router.api_route('/api/feeds/{path:path}', methods=['GET','POST','DELETE'])
async def proxy_feeds(path: str, request: Request, user: User = _CurrentUser):
    _set_user_state(request, user)
    return await forward_to('agent', f'api/feeds/{path}', request)

@router.api_route('/api/feeds', methods=['GET','POST'])
async def proxy_feeds_root(request: Request, user: User = _CurrentUser):
    _set_user_state(request, user)
    return await forward_to('agent', 'api/feeds', request)

@router.api_route('/api/page-monitors/{path:path}', methods=['GET','POST','PATCH','DELETE'])
async def proxy_page_monitors(path: str, request: Request, user: User = _CurrentUser):
    _set_user_state(request, user)
    return await forward_to('agent', f'api/page-monitors/{path}', request)

@router.api_route('/api/page-monitors', methods=['GET','POST'])
async def proxy_page_monitors_root(request: Request, user: User = _CurrentUser):
    _set_user_state(request, user)
    return await forward_to('agent', 'api/page-monitors', request)

@router.api_route('/api/schedules/{path:path}', methods=['GET','POST','PATCH','DELETE'])
async def proxy_schedules(path: str, request: Request, user: User = _CurrentUser):
    _set_user_state(request, user)
    return await forward_to('agent', f'api/schedules/{path}', request)

@router.api_route('/api/schedules', methods=['GET','POST'])
async def proxy_schedules_root(request: Request, user: User = _CurrentUser):
    _set_user_state(request, user)
    return await forward_to('agent', 'api/schedules', request)

@router.api_route('/api/tts/{path:path}', methods=['GET'])
async def proxy_tts(path: str, request: Request):
    return await forward_to('agent', f'api/tts/{path}', request)

@router.api_route('/api/memory/{path:path}', methods=['GET','POST','PATCH','DELETE'])
async def proxy_memory(path: str, request: Request, user: User = _CurrentUser):
    _set_user_state(request, user)
    return await forward_to('agent', f'api/memory/{path}', request)

@router.api_route('/api/memory', methods=['GET','POST'])
async def proxy_memory_root(request: Request, user: User = _CurrentUser):
    _set_user_state(request, user)
    return await forward_to('agent', 'api/memory', request)

# ── Perception routes ──

@router.api_route('/api/system/{path:path}', methods=['GET'])
async def proxy_system(path: str, request: Request, user: User = _CurrentUser):
    _set_user_state(request, user)
    return await forward_to('perception', f'api/system/{path}', request)

@router.api_route('/api/vms/{path:path}', methods=['GET','POST','DELETE'])
async def proxy_vms(path: str, request: Request, user: User = _CurrentUser):
    _set_user_state(request, user)
    return await forward_to('perception', f'api/vms/{path}', request)

@router.api_route('/api/vms', methods=['GET','POST'])
async def proxy_vms_root(request: Request, user: User = _CurrentUser):
    _set_user_state(request, user)
    return await forward_to('perception', 'api/vms', request)

@router.api_route('/api/network/{path:path}', methods=['GET'])
async def proxy_network(path: str, request: Request, user: User = _CurrentUser):
    _set_user_state(request, user)
    return await forward_to('perception', f'api/network/{path}', request)

# ── Speech (no auth — audio elements cannot set headers) ──

@router.api_route('/api/speech/{path:path}', methods=['POST'])
async def proxy_speech(path: str, request: Request):
    return await forward_to('perception', f'api/speech/{path}', request)
