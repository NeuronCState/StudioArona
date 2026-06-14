# 邮件通知设置（Outlook 个人账户 · 中文 UI）

## 背景
微软 2024-05 起对 outlook.com / hotmail.com / live.com 禁用了 `SmtpClientAuthentication`（basic auth），所以密码登录直接返回 535 错误。改用 **Microsoft Graph API + OAuth2** 绕过。

## 第一步：注册 Azure 应用（中文 UI）

> 你现在看到的应该是 `https://entra.microsoft.com`（中文版 "Microsoft Entra 管理中心"），下面是每个按钮的**中文名 → 英文名**对照。

### 1.1 找 "应用注册"
左侧菜单（左侧栏）从上往下找：
- **标识**（Identity）
- → **应用程序**（Applications）
- → **应用注册**（App registrations）  ← 点这个

或者直接顶部搜索框输入：**应用注册**

### 1.2 新建应用
点 **+ 新建注册**（New registration）按钮（页面顶部）

填表：
| 字段（中文） | 字段（英文） | 填什么 |
|---|---|---|
| 名称 | Name | `什亭之匣 Notifier` |
| 支持的账户类型 | Supported account types | **任何组织目录(任何 Microsoft Entra ID 租户 - 多租户)中的帐户和个人 Microsoft 帐户(如 Skype、Xbox)** ← 必须选这个，否则 personal outlook.com 没法用 |
| 重定向 URI | Redirect URI | **留空**（device code flow 不需要） |

点 **注册**（Register）按钮。

### 1.3 复制两个 ID
注册完成后跳转到应用"概览"页面，复制：

| 中文 | 英文 | 填到 .env.local 哪个 |
|---|---|---|
| **应用程序(客户端) ID** | Application (client) ID | `NOTIFY_OAUTH_CLIENT_ID` |
| **目录(租户) ID** | Directory (tenant) ID | `NOTIFY_OAUTH_TENANT_ID`（个人账户可填 `common` 或 `consumers`）|

### 1.4 创建客户端密码
左侧菜单（应用页内）找：
- **证书和密码**（Certificates & secrets）
- 点 **+ 新建客户端密码**（New client secret）
- 描述：`什亭之匣 Notifier Token`
- 过期：选 24 个月
- 点 **添加**（Add）

**关键**：复制弹窗里"**值**"列的内容（不是"**密钥 ID**"），这个值关掉页面就再也看不到了。

填到：`NOTIFY_OAUTH_CLIENT_SECRET`

### 1.5 添加 API 权限
左侧菜单（应用页内）找：
- **API 权限**（API permissions）
- 点 **+ 添加权限**（Add a permission）
- 选 **Microsoft Graph**
- 选 **委托的权限**（Delegated permissions）← **重要**：要选"委托"不是"应用程序"
- 在搜索框输：**Mail.Send** → 勾上
- 再搜：**User.Read** → 勾上
- 再搜：**offline_access** → 勾上
- 点 **添加权限**（Add permissions）按钮（页面底部）

页面会显示：
- Microsoft Graph
  - 委托的权限
    - Mail.Send ✓
    - User.Read ✓
    - offline_access ✓

**个人账户没有 admin，但委托权限会在第一次 device code 登录时由你（用户）自己同意授权。**

## 第二步：填到 .env.local

打开 `/Users/zhangxuanning/StudioArona/.env.local`，找到这块：

```
NOTIFY_OAUTH_TENANT_ID=common
NOTIFY_OAUTH_CLIENT_ID=
NOTIFY_OAUTH_CLIENT_SECRET=
```

填上：

```
NOTIFY_OAUTH_TENANT_ID=common
NOTIFY_OAUTH_CLIENT_ID=<刚才复制的 应用程序(客户端) ID>
NOTIFY_OAUTH_CLIENT_SECRET=<刚才复制的 客户端密码"值">
NOTIFY_FROM_USER=StudioArona301@outlook.com
NOTIFY_FROM_NAME=什亭之匣 AI
```

保存（chmod 600 已经设过了）。

## 第三步：首次 device code 登录

1. 重启 api-gateway：
   ```bash
   cd /Users/zhangxuanning/StudioArona
   ./run.sh restart   # 或 start
   ```

2. 在 Admin Page（http://localhost:5173/admin）点 **"📧 测试发送"** 按钮

3. 终端会打印：
   ```
   === Outlook OAuth 登录 ===
   打开: https://microsoft.com/devicelogin
   输入代码: ABC123XYZ
   ```
   浏览器会自动打开（如果没自动打开，自己复制 URL）

4. 在 `https://microsoft.com/devicelogin` 输入 8 位代码
5. 用 `StudioArona301@outlook.com` 登录
6. 同意权限（Mail.Send / User.Read / offline_access）
7. 自动跳回，token 缓存到 `~/.studioarona/oauth_token.json`（chmod 600）

邮件秒到。

## 第四步：之后
- access_token 1 小时过期 → 自动用 refresh_token 续
- refresh_token 90 天有效 → 每次使用 Microsoft 会轮换（自动存）
- 90 天后再 device code 一次

## 调试

```bash
# 看当前 token 状态
curl -s http://localhost:8080/api/admin/notify/status \
  -H "Authorization: Bearer <你的 token>" | jq

# 删 token 强制重新 device code
rm ~/.studioarona/oauth_token.json

# 看死信
curl -s http://localhost:8080/api/admin/notify/dlq \
  -H "Authorization: Bearer <你的 token>" | jq

# 看 notifier 日志
tail -f ~/.studioarona/api-gateway.log | grep notifier
```

## 群发上限
- outlook.com 个人账户：每发件邮箱 **300 封/天**
- 10 用户群发 1 次 = 10 封，一天可以 30 次
- 超限会 429 限速

## 还在哪卡住？

| 卡住 | 解决 |
|---|---|
| 找不到"应用注册" | 左侧搜索框输"应用注册"，或顶部搜索"应用注册" |
| "支持的账户类型"没看到"个人 Microsoft 账户"选项 | 说明你登录的租户不支持 → 用"任何组织目录…+个人 Microsoft 账户" |
| "委托的权限" 选项灰 | 切换账户类型为"个人 Microsoft 账户"或"多租户+个人" |
| 客户端密码"值"看不到 | 重新建一个（旧值已经不能看了） |
| device code 卡在 `authorization_pending` | 终端会一直轮询，**你**去浏览器输代码并同意权限 |
