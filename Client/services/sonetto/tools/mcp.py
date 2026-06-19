"""MCP 工具管理器 — 通用 MCP 客户端桥接框架。

MCP server definitions are managed by Studio Arona's graphical configuration
page and persisted in studio_config.yaml.
"""

from langchain_core.tools import BaseTool

_client = None
_tools: list[BaseTool] | None = None


async def init_mcp_tools() -> list[BaseTool]:
    """Initialize configured MCP servers and return their tools."""
    global _client, _tools
    if _tools is not None:
        return _tools
    from config.studio import mcp_servers

    servers = mcp_servers()
    if not servers:
        _tools = []
        return _tools

    from langchain_mcp_adapters.client import MultiServerMCPClient

    _client = MultiServerMCPClient(servers)
    _tools = await _client.get_tools()
    return _tools


async def close_mcp():
    """释放 MCP 客户端资源。"""
    global _client, _tools
    _client = None
    _tools = None
