/**
 * 关掉系统的自动更正 / 首字母大写 / 文本补全。
 *
 * macOS 的自动更正在 WKWebView 里是默认开着的：在搜索框里打 `door`，系统会
 * 在插入点下方弹一个深色的「Door ×」替换建议气泡。那是**系统浮动层**，不归
 * WebView 的 CSS 管 —— `overflow: hidden` 裁不到它，`z-index` 也压不住，于是
 * 它悬在输入框下沿、盖住下方那行结果摘要，直到失焦才消失（0.2.17 实测）。
 *
 * 搜索词、密码、激活码、恢复码都不是自然语言，不该被更正；而且「显示密码」
 * 把 type 切到 text 之后，系统同样会去改一个密码 —— 那就不只是碍眼了。
 *
 * 三个属性一起给：`spellCheck` 关掉连续拼写检查（自动更正挂在它下面），
 * `autoCorrect` / `autoCapitalize` 直接关元素上的更正与首字母大写。
 */
export const NO_AUTOCORRECT = {
  spellCheck: false,
  autoCorrect: "off",
  autoCapitalize: "off",
} as const;
