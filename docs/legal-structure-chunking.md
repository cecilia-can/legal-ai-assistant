# 法律结构切片与质量校验

使用 `npm run chunk:document -- --document <documentId> --user-id <userId>` 对已成功规范化的文档执行切片。私有知识库仅允许拥有者执行；系统知识库可由已验证用户读取。

可先运行 `npm run list:knowledge-context` 获取 `userId`，再运行 `npm run list:knowledge-context -- --user-id <userId>` 获取该用户可访问的 `knowledgeBaseId`。

切片读取 `Document.normalizedUri`，不会重新解析或修改原始文件及规范化产物。法规/司法解释识别章、节、条、款、项；案例识别事实、争议焦点、法院观点、裁判结果；合同识别条款编号。未匹配时使用标题与段落的通用策略。

每次执行以 `Document + normalizedContentHash + strategyVersion` 建立切片集。同一输入和策略会复用已激活结果；新策略会激活新集合并将旧集合标为 `superseded`。质量校验发现空内容或乱码时集合为 `blocked`，不会替换此前的有效集合；异常截断和重复页眉页脚作为人工复核警告保存。

运行 `npm run verify:legal-structure` 可验证结构识别、超长拆分、来源路径保护和质量检查的核心场景。

切片后，可用 `npm run preview:chunks -- --document <documentId> --user-id <userId>` 生成当前激活切片集的 Markdown 预览，默认写入 `data/chunk-previews/`。预览包含完整正文、页码、章节/条款定位、内容哈希和质量提示；使用 `--output <path>` 指定项目内保存位置。加上 `--json` 可仅输出机器可读结果；如需查看历史或被质量校验拦截的结果，增加 `--chunk-set <chunkSetId>`。
