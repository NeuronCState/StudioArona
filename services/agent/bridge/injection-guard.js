/**
 * Prompt Injection Guard — OWASP LLM01 defense.
 *
 * Scans user input for common injection patterns before sending to LLM.
 * Returns { isSafe, reason }.
 */

// Injection patterns (case-insensitive regex)
const INJECTION_PATTERNS = [
  // Chinese patterns
  /忽略.{0,10}(上面|之前|以上|前文|系统)/iu,
  /你现在是.{0,20}(黑客|管理员|开发者|admin|root)/iu,
  /忘掉.{0,10}(上面|之前|以上|前文|系统|所有)/iu,
  /不要.{0,10}(遵守|遵循|执行|回答)/iu,
  /假装.{0,10}你是/iu,
  /system:\s*/iu,
  /<\|system\|>/iu,

  // English patterns
  /ignore.{0,10}(above|previous|system|instructions)/iu,
  /you are now.{0,20}(admin|root|developer|hacker)/iu,
  /act as.{0,20}(admin|root|developer)/iu,
  /jailbreak/iu,
  /DAN\s*mode/iu,
  /disregard.{0,20}instructions/iu,
  /forget.{0,20}(everything|all|previous)/iu,

  // Universal patterns
  /tell me.{0,50}(password|secret|credential|token|key)/iu,
  /output.{0,20}(your|system).{0,20}(prompt|instruction)/iu,
  /reveal.{0,20}(your|system).{0,20}(prompt|instruction)/iu,

  // ── M5.2 W3: Enhanced injection guard rules ─────────────────────

  // Source code / config / secret probing
  /读取.{0,20}(源码|代码|配置|env|secret|token)/iu,

  // Command execution probing
  /执行.{0,20}(命令|shell|bash|docker|git)/iu,

  // User impersonation / account switching
  /(切换|登录|假装).{0,20}(用户|账号|管理员)/iu,

  // Cross-user data access probing
  /(查看|访问).{0,20}(其他用户|别人的)/iu,

  // Destructive system commands (even embedded in text)
  /(rm\s+-rf|dd\s+if=|mkfs|shutdown|reboot)/iu,
];

// Known safe patterns that shouldn't be blocked
const SAFE_PATTERNS = [
  /^你好/,
  /^测试/,
  /^帮/,
  /^查/,
];

export function scanInjection(text) {
  if (!text || text.length === 0) return { isSafe: true, blocked: false, reason: "" };

  for (const pattern of INJECTION_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      return {
        isSafe: false,
        blocked: true,
        reason: `Injection pattern detected: "${match[0]}"`,
        pattern: pattern.source,
      };
    }
  }

  return { isSafe: true, blocked: false, reason: "" };
}
