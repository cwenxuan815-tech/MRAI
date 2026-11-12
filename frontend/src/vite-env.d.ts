/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** 后端接口前缀，默认走 Vite 代理的 /api */
  readonly VITE_API_BASE?: string
  /** Dify 智能助手 WebApp 地址（iframe 嵌入用） */
  readonly VITE_DIFY_WEBAPP_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
