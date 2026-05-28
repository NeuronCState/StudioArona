# 04 — OpenAPI 合约补全

> 分支: `d/openapi-spec-completion`
> 预估: 4h | 角色: D | 依赖: 02-安全加固（因为涉及新增 register/weather 等端点定义）

## 目标

将所有已实现但未写入 `openapi.yaml` 的端点补全，然后重新生成 TS 和 Python 类型。

## 需要补全的端点

### 4.1 Auth（1 个）

```yaml
/api/auth/register:
  post:
    summary: Register a new user with invitation code
    requestBody:
      required: true
      content:
        application/json:
          schema:
            type: object
            required: [username, password, invitation_code]
            properties:
              username: { type: string }
              password: { type: string, minLength: 6 }
              invitation_code: { type: string }
    responses:
      201: { description: User created }
      400: { description: Invalid invitation code or username taken }
```

### 4.2 User（1 个）

```yaml
/api/me:
  patch:
    summary: Update user profile
    requestBody:
      content:
        application/json:
          schema:
            type: object
            properties:
              username: { type: string }
              display_name: { type: string }
    responses:
      200: { description: Profile updated }
```

### 4.3 Weather（1 个）

```yaml
/api/weather:
  get:
    summary: Get current weather based on IP geolocation
    responses:
      200:
        description: Weather data
        content:
          application/json:
            schema:
              type: object
              properties:
                temperature: { type: number }
                description: { type: string }
                icon: { type: string }
                location: { type: string }
```

### 4.4 Upload（1 个）

```yaml
/api/upload:
  post:
    summary: Upload a file
    requestBody:
      content:
        multipart/form-data:
          schema:
            type: object
            properties:
              file: { type: string, format: binary }
    responses:
      200: { description: File uploaded }
```

### 4.5 NAS（2 个）

```yaml
/api/nas/info:
  get:
    summary: Get NAS connection info
    responses:
      200: { description: NAS info }

/api/nas/go:
  get:
    summary: Redirect to NAS web UI with auto-login
    responses:
      302: { description: Redirect to NAS }
```

### 4.6 Speech（1 个）

```yaml
/api/speech/transcribe:
  post:
    summary: Transcribe audio file
    requestBody:
      content:
        multipart/form-data:
          schema:
            type: object
            properties:
              file: { type: string, format: binary }
    responses:
      200:
        description: Transcription result
        content:
          application/json:
            schema:
              type: object
              properties:
                text: { type: string }
                language: { type: string }
                emotion: { type: string }
```

### 4.7 Page Monitors（4 个）

```yaml
/api/page-monitors:
  get:
    summary: List page monitors
  post:
    summary: Create page monitor

/api/page-monitors/{id}:
  get:
    summary: Get page monitor
  delete:
    summary: Delete page monitor
```

### 4.8 WebSocket（补充到 components/schemas 或单独 section）

```yaml
# 在 openapi.yaml 末尾添加 x-websocket 或用 AsyncAPI 格式
# 至少在 info.description 中说明 WS 端点和事件格式
```

## 执行步骤

1. 编辑 `packages/contracts/openapi.yaml`，添加上述端点
2. 运行 `make generate-types` 重新生成 TS 和 Python 类型
3. 检查生成的类型是否与实际代码匹配
4. 运行 `make contract-test` 验证合约

## 验证步骤

1. `make generate-types` — 无错误
2. `make contract-test` — 所有端点通过 schemathesis fuzz
3. `make lint` — OpenAPI spec 通过 Spectral lint

## Commit

```
feat(contracts): add missing endpoints to OpenAPI spec

Add register, weather, profile update, nas, upload, speech,
and page-monitor endpoints. Regenerate TS and Python types.
```
