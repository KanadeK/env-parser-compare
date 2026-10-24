# env-parser-compare 中文说明

在从 dotenv 切换到 Node.js 原生 env 解析前，让**同一份文件**通过真实的两个解析器，
比较键是否存在、字符串值是否相同、返回键顺序是否一致。无需猜测通用 `.env` 语法。

```sh
npm ci --ignore-scripts
node bin/env-parser-compare.mjs examples/portable.env.example
node bin/env-parser-compare.mjs examples/different.env.example
node bin/env-parser-compare.mjs examples/value.env.example
```

需要 Node 22.13+（22.x）或 24+。第一个退出 0；后两例分别因冒号赋值被原生解析器忽略、
转义引号产生不同值而退出 1。默认输出 JSON，隐藏键名、所有值、值长度与哈希、输入路径
和原始错误。只保留序号、比较结果和候选行号。`--show-keys` 可显式显示键名，分享前请检查。
候选行号只是文本线索，可能落在多行字符串内；真实比较结果不依赖行号推测。

```sh
node bin/env-parser-compare.mjs --check-order examples/order.env.example
node bin/env-parser-compare.mjs --expect-keys examples/required.keys examples/portable.env.example
```

预期键文件每行只写一个键名，支持空行和 `#` 注释。它要求精确键集合，能发现两个解析器
都遗漏的配置。`--check-order` 把实际键顺序差异也作为失败条件；工具不运行变量展开器。

退出 0 表示完整比较且所有约定通过；退出 1 表示差异；退出 2 表示输入错误、资源限制或
比较未完成。两个解析器都忽略无效行时可能一致，因此通过不表示语法有效或应用能启动。
这里不处理多文件合并、环境覆盖、dotenv-expand、fast mode、Compose 或其他语言加载器。

运行时不联网、不执行 shell、不展开表达式、不写入 process.env。每个解析器使用固定
worker，默认 5 秒期限；输入上限 1 MiB，键集合上限 4,096。内存限制不是操作系统沙箱，
文件读取停滞也不受解析期限覆盖。请保持输入文件稳定；详见[英文完整说明](README.md)。

发行 tarball 可用 `npm install --global --ignore-scripts ./env-parser-compare-0.1.0.tgz`
安装。首次需获取独立依赖 dotenv 18.0.9，或使用已准备好的 npm 缓存。这里没有宣称发布到
npm registry。卸载：`npm uninstall --global env-parser-compare`；本地依赖可用普通
`npm uninstall env-parser-compare` 删除。英文说明还包含完整 API、测试与清理流程。

MIT 许可证；独立安装的 dotenv 保留 BSD-2-Clause 许可证与原始版权。
