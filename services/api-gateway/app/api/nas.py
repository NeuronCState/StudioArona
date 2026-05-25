"""NAS (飞牛 fnOS) API — auto-login and user info."""

import logging

from fastapi import APIRouter, Depends
from fastapi.responses import HTMLResponse

from app.auth.deps import get_current_user
from app.models.user import User

from app.nas import NAS_WEB_URL, generate_nas_token

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/nas", tags=["NAS"])


@router.get("/info")
async def nas_info(user: User = Depends(get_current_user)):
    """Return NAS connection info for the current user."""
    return {
        "url": NAS_WEB_URL,
        "username": user.username,
        "autoLoginAvailable": bool(generate_nas_token(user.username)),
    }


@router.get("/go", response_class=HTMLResponse)
async def nas_go(user: User = Depends(get_current_user)):
    """Auto-login page: opens NAS with credential auto-fill."""
    token = generate_nas_token(user.username) or ""

    html = f"""<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>正在跳转 NAS...</title>
<style>
  body {{ margin:0; display:flex; align-items:center; justify-content:center;
         height:100vh; font-family:system-ui; background:#1a1e23; color:#fff; }}
  .loader {{ text-align:center; }}
  .spinner {{ width:40px; height:40px; border:3px solid #333; border-top-color:#6366f1;
              border-radius:50%; animation:spin 0.8s linear infinite; margin:0 auto 16px; }}
  @keyframes spin {{ to {{ transform:rotate(360deg); }} }}
</style>
</head>
<body>
<div class="loader">
  <div class="spinner"></div>
  <p style="color:#999">正在登录飞牛 NAS...</p>
  <p style="font-size:12px;color:#666;margin-top:8px">账号: {user.username}</p>
</div>
<script>
(function() {{
  var username = "{user.username}";
  var token = "{token}";
  var nasUrl = "{NAS_WEB_URL}";

  // Strategy 1: Try to login via the NAS API with JWT token
  async function tryAutoLogin() {{
    if (!token) {{
      // No RSA key configured — fall back to direct open
      window.location.href = nasUrl;
      return;
    }}

    try {{
      var resp = await fetch(nasUrl + "/cgi/login", {{
        method: "POST",
        headers: {{ "Content-Type": "application/json" }},
        body: JSON.stringify({{ username: username, token: token }}),
        mode: "cors"
      }});
      if (resp.ok) {{
        var data = await resp.json();
        if (data && data.token) {{
          // NAS returned a session token — redirect with it
          document.cookie = "trim_token=" + data.token + ";path=/;max-age=86400";
        }}
      }}
    }} catch(e) {{
      console.log("Auto-login via JWT not available, opening NAS directly");
    }}

    // Open NAS in the same tab
    window.location.href = nasUrl;
  }}

  tryAutoLogin();
}})();
</script>
</body>
</html>"""
    return HTMLResponse(content=html)
