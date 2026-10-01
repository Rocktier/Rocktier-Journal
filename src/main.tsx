import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { syncHtmlLang } from "./i18n";
import "./styles/tokens.css";
import "./styles/global.css";

// 启动时同步 <html lang>：屏幕阅读器要用对应语言的语音引擎
syncHtmlLang();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
